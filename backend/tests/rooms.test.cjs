const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { postgresClient } = require('./postgres-client.cjs');
const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20260913000000_multiplayer_rooms/migration.sql'), 'utf8');
const baseline = fs.readFileSync(path.join(__dirname, 'legacy-multiplayer.sql'), 'utf8');

// Exercise the production TypeScript services, replacing only infrastructure:
// PostgreSQL transport, random artifact selection, and geographic score lookup.
function services(db) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module);
    mod.filename = file;
    mod.paths = Module._nodeModulePaths(root);
    cache.set(file, mod);
    mod.require = name => {
      if (name === '@/lib/db') return { db };
      if (name === '@/lib/artifactSelector') return { pickRandomArtifact: async () => ({ objectId: 1n, iso3: 'USA', beginYear: 0, endYear: 0, imageUrl: 'https://example.test/art.jpg', title: 'Test artifact' }) };
      if (name === './scoring') return { ScoringModule: { calculateScore: async (_country, _actual, year) => ({ totalScore: year, countryScore: year, yearScore: 0, distanceKm: 0, yearsAway: 0 }) } };
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.ts`));
      return require(name);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file);
    return mod.exports;
  }
  return { ...load('lib/multiplayer/Room.ts'), ...load('lib/multiplayer/history.ts'), ...load('lib/multiplayer/GameSession.ts'), ...load('lib/multiplayer/placements.ts') };
}

async function fresh() {
  const pg = new PGlite();
  await pg.exec(baseline);
  await pg.exec(migration);
  await pg.exec(fs.readFileSync(path.join(root, 'prisma/migrations/20260914000000_results_reveal/migration.sql'), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(root, 'prisma/migrations/20260915000000_manual_round_advance/migration.sql'), 'utf8'));
  return { pg, db: postgresClient(pg) };
}

const rejected = (promise, status) => assert.rejects(promise, error => error.statusCode === status);

test('stale concurrent guess views recover without double finalization', async () => {
  const { pg, db } = await fresh();
  try {
    const s = services(db);
    const room = await db.multiplayer_rooms.create({ data: { max_health: 500, max_rounds: 3 } });
    const host = await s.joinRoom(room.id, 'Host', '');
    await s.joinRoom(room.id, 'Guest', '');
    const state = await s.transitionRoom(room.id, 'start', host.credential, null);
    await openRound(db, state.currentSessionId);
    // Both requests load before either commits, so neither prefetches an artifact.
    const first = await s.GameSession.load(state.currentSessionId);
    const second = await s.GameSession.load(state.currentSessionId);
    await first.submitGuess(state.players[0].id, 'USA', 1000, 1, false);
    const result = await second.submitGuess(state.players[1].id, 'USA', 0, 1, false);
    assert.equal(result.roundResolved, false);
    assert.ok((await s.roomSnapshot(room.id)).players.every(p => p.hasGuessedThisRound));
    let broadcast;
    const finished = await s.roomStatus(room.id, snapshot => { broadcast = snapshot; });
    assert.equal(finished.status, 'finished');
    assert.equal(broadcast, finished);
    assert.ok(finished.resultsRevealAt);
    const recovered = await s.roomStatus(room.id);
    assert.equal(recovered.resultsRevealAt, finished.resultsRevealAt);
    assert.deepEqual(recovered.players, finished.players);
    assert.equal(recovered.roundHistory.length, 1);
  } finally { await pg.close(); }
});

test('additive migration preserves legacy history and only awards reconstructable placements', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(baseline);
    const db = postgresClient(pg);
    const full = await db.multiplayer_games.create({ data: { status: 'finished', current_round: 2 } });
    const players = [];
    for (let i = 0; i < 3; i++) players.push(await db.multiplayer_players.create({ data: { game_id: full.id, name: `Legacy ${i}`, health: i ? 0 : 100, is_eliminated: i > 0 } }));
    const rounds = [1, 2].map(round => ({ round, guesses: players.map((p, i) => ({ playerId: p.id, isEliminated: i === 2 || (i === 1 && round === 2) })) }));
    await db.multiplayer_games.update({ where: { id: full.id }, data: { round_history: rounds } });
    for (const p of players) await db.multiplayer_guesses.create({ data: { game_id: full.id, player_id: p.id, round_number: 1, total_score: 100 } });
    const partial = await db.multiplayer_games.create({ data: { status: 'finished', current_round: 3, last_round_reveal: { round: 3, guesses: [] } } });
    await db.multiplayer_players.create({ data: { game_id: partial.id, name: 'Unknown elimination', health: 0, is_eliminated: true } });
    const active = await db.multiplayer_games.create({ data: { status: 'active', current_round: 2 } });
    const activePlayer = await db.multiplayer_players.create({ data: { game_id: active.id, name: 'Unresolved guess' } });
    for (const round of [1, 2]) await db.multiplayer_guesses.create({ data: { game_id: active.id, player_id: activePlayer.id, round_number: round, total_score: 100 } });
    await pg.exec(migration);
    const migrated = await db.multiplayer_games.findUnique({ where: { id: full.id } });
    assert.equal(migrated.room_id, full.id);
    assert.deepEqual(migrated.round_history, rounds);
    assert.equal(await db.multiplayer_guesses.count(), 5);
    const ranked = await db.multiplayer_players.findMany({ where: { game_id: full.id }, orderBy: { final_placement: 'asc' } });
    assert.deepEqual(ranked.map(p => [p.id, p.final_placement, p.elimination_round]), [[players[0].id, 1, null], [players[1].id, 2, 2], [players[2].id, 3, 1]]);
    assert.equal((await db.multiplayer_players.findFirst({ where: { game_id: partial.id } })).final_placement, null);
    assert.equal((await db.multiplayer_players.findUnique({ where: { id: activePlayer.id } })).cumulative_score, 100);
    const s = services(db);
    assert.deepEqual((await s.sessionDetails(partial.id, partial.id)).roundHistory, [{ round: 3, guesses: [] }]);
    const stats = await s.memberStatistics(partial.id);
    assert.equal(stats[0].sessionsPlayed, 1);
    assert.deepEqual(stats[0].placements, {});
    assert.equal((await db.multiplayer_rooms.findUnique({ where: { id: full.id } })).host_member_id, players[0].id);
  } finally { await pg.close(); }
});

test('rematches, credentials, membership changes, atomic results, and history', async () => {
  const { pg, db } = await fresh();
  try {
    const s = services(db);
    const room = await db.multiplayer_rooms.create({ data: { max_health: 1000, max_rounds: 3 } });
    const host = await s.joinRoom(room.id, 'Host', '');
    const second = await s.joinRoom(room.id, 'Second', '');
    const third = await s.joinRoom(room.id, 'Third', '');
    const saved = await s.joinRoom(room.id, 'Ignored rename', second.credential);
    assert.equal(saved.memberId, second.memberId);
    assert.equal(saved.members.length, 3);
    assert.equal(saved.members[1].name, 'Second');
    assert.ok(!JSON.stringify(await s.roomSnapshot(room.id)).includes(host.credential));
    await rejected(s.transitionRoom(room.id, 'start', host.memberId, null), 401);
    await rejected(s.transitionRoom(room.id, 'start', second.credential, null), 403);
    await rejected(s.transitionRoom(room.id, 'remove', second.credential, null, host.memberId), 403);
    const starts = await Promise.allSettled([s.transitionRoom(room.id, 'start', host.credential, null), s.transitionRoom(room.id, 'start', host.credential, null)]);
    assert.equal(starts.filter(r => r.status === 'fulfilled').length, 1);
    let state = await s.roomSnapshot(room.id);
    const firstId = state.currentSessionId;
    const initialRevision = state.revision;
    assert.equal(state.sessionNumber, 1);
    assert.equal(await db.multiplayer_games.count(), 1);
    const firstPlayers = state.players;
    await rejected(s.authorizeGuess(firstId, second.credential, firstPlayers[0].id), 403);
    await rejected(s.authorizeGuess(firstId, firstPlayers[0].id, firstPlayers[0].id), 401);
    await rejected(s.transitionRoom(room.id, 'leave', host.credential, firstId), 409);
    await rejected(s.joinRoom(room.id, 'Late arrival', ''), 409);
    async function playRound(scores) {
      const current = await s.roomSnapshot(room.id);
      await db.multiplayer_games.update({ where: { id: current.currentSessionId }, data: { round_starts_at: new Date(Date.now() - 1000), round_ends_at: new Date(Date.now() + 60000) } });
      const active = current.players.filter(p => !p.isEliminated);
      for (let i = 0; i < active.length; i++) {
        const session = await s.GameSession.load(current.currentSessionId);
        await session.submitGuess(active[i].id, 'USA', scores[i], current.currentRound);
      }
      return s.roomSnapshot(room.id);
    }
    state = await playRound([1000, 500, 0]);
    assert.equal(state.currentRound, 2);
    await rejected((await s.GameSession.load(firstId)).submitGuess(firstPlayers[0].id, 'USA', 1000, 1), 409);
    state = await playRound([1000, 0]);
    assert.equal(state.status, 'finished');
    const revealAt = state.resultsRevealAt;
    assert.ok(Number.isFinite(Date.parse(revealAt)));
    assert.ok(Date.parse(revealAt) > Date.now());
    assert.deepEqual(state.players.map(p => p.finalPlacement), [1, 2, 3]);
    assert.deepEqual(state.players.map(p => p.eliminationRound), [null, 2, 1]);
    const before = await s.memberStatistics(room.id);
    await Promise.all([s.GameSession.load(firstId).then(g => g.resolveRoundIfNeeded()), s.GameSession.load(firstId).then(g => g.resolveRoundIfNeeded())]);
    assert.deepEqual(await s.memberStatistics(room.id), before);
    assert.equal((await s.roomSnapshot(room.id)).resultsRevealAt, revealAt);
    const oldDetails = await s.sessionDetails(room.id, firstId);
    await Promise.all([s.transitionRoom(room.id, 'reopen', host.credential, firstId), s.transitionRoom(room.id, 'reopen', host.credential, firstId)]);
    state = await s.roomSnapshot(room.id);
    assert.equal(state.status, 'waiting');
    assert.deepEqual(state.members.map(m => m.id), [host.memberId, second.memberId, third.memberId]);
    assert.equal(state.maxHealth, 1000);
    await s.transitionRoom(room.id, 'leave', host.credential, firstId);
    state = await s.roomSnapshot(room.id);
    assert.equal(state.hostMemberId, second.memberId);
    await rejected(s.transitionRoom(room.id, 'start', host.credential, firstId), 403);
    await s.transitionRoom(room.id, 'remove', second.credential, firstId, third.memberId);
    await rejected(s.transitionRoom(room.id, 'start', second.credential, firstId), 400);
    const fourth = await s.joinRoom(room.id, 'Fourth', '');
    await s.joinRoom(room.id, '', third.credential);
    state = await s.transitionRoom(room.id, 'start', second.credential, firstId);
    const secondId = state.currentSessionId;
    assert.notEqual(firstId, secondId);
    await rejected(s.transitionRoom(room.id, 'reopen', second.credential, firstId), 409);
    assert.equal(state.sessionNumber, 2);
    assert.ok(state.revision > initialRevision);
    assert.ok(state.players.every(p => p.health === 1000 && !p.isEliminated && p.cumulativeScore === 0 && !p.hasGuessedThisRound));
    assert.deepEqual(state.roundHistory, []);
    await rejected(s.authorizeGuess(firstId, second.credential, firstPlayers[1].id), 409);
    const reopenedDetails = await s.sessionDetails(room.id, firstId);
    assert.deepEqual({ ...reopenedDetails, serverTime: null }, { ...oldDetails, serverTime: null });
    const filtered = await s.sessionHistory(room.id, new URLSearchParams({ memberId: host.memberId, limit: '1' }));
    assert.equal(filtered.total, 1);
    assert.equal(filtered.sessions[0].sessionId, firstId);
    await rejected(s.sessionDetails(randomUUID(), firstId), 404);
    for (let round = 0; round < 3; round++) state = await playRound([1000, 1000, 1000]);
    assert.equal(state.status, 'finished');
    assert.ok(state.players.every(p => p.finalPlacement === 1 && p.cumulativeScore === 3000));
    const stats = await s.memberStatistics(room.id);
    assert.equal(stats.find(m => m.memberId === host.memberId).departed, true);
    assert.equal(stats.find(m => m.memberId === host.memberId).wins, 1);
    assert.equal(stats.find(m => m.memberId === second.memberId).secondPlaces, 1);
    assert.equal(stats.find(m => m.memberId === second.memberId).wins, 1);
    const history = await s.sessionHistory(room.id, new URLSearchParams({ limit: '1' }));
    assert.equal(history.total, 2);
    assert.equal(history.sessions[0].sessionId, secondId);
    assert.equal(history.sessions[0].winners.length, 3);
    assert.equal((await s.sessionHistory(room.id, new URLSearchParams({ page: '2', limit: '1' }))).sessions[0].sessionId, firstId);
    await s.transitionRoom(room.id, 'reopen', second.credential, secondId);
    await s.transitionRoom(room.id, 'start', second.credential, secondId);
    for (let round = 0; round < 3; round++) state = await playRound([1000, 1000, 1000]);
    assert.equal(state.sessionNumber, 3);
    await s.transitionRoom(room.id, 'reopen', second.credential, state.currentSessionId);
    for (const member of [second, fourth, third]) await s.transitionRoom(room.id, 'leave', member.credential, state.currentSessionId);
    assert.equal((await s.roomSnapshot(room.id)).hostMemberId, null);
    const newHost = await s.joinRoom(room.id, 'New host', '');
    assert.equal(newHost.hostMemberId, newHost.memberId);
    assert.equal((await s.memberStatistics(room.id)).find(m => m.memberId === second.memberId).sessionsPlayed, 3);
  } finally { await pg.close(); }
});

test('room capacity is serialized at twenty members', async () => {
  const { pg, db } = await fresh();
  try {
    const s = services(db);
    const room = await db.multiplayer_rooms.create({ data: {} });
    for (let i = 0; i < 19; i++) await s.joinRoom(room.id, `Player ${i}`, '');
    const results = await Promise.allSettled([s.joinRoom(room.id, 'Last', ''), s.joinRoom(room.id, 'Overflow', '')]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await s.roomSnapshot(room.id)).members.length, 20);
  } finally { await pg.close(); }
});

test('placement order covers simultaneous eliminations, health, score, and competition ranks', () => {
  const { rankPlayers } = services({});
  const player = (id, health, score, round = null) => ({ id, health, cumulative_score: score, is_eliminated: round !== null, elimination_round: round });
  assert.deepEqual(rankPlayers([player('early', 0, 9000, 1), player('late', 0, 100, 2), player('winner', 1, 0)]).map(p => [p.id, p.final_placement]), [['winner', 1], ['late', 2], ['early', 3]]);
  assert.deepEqual(rankPlayers([player('a', 5, 100), player('b', 5, 100), player('c', 5, 99)]).map(p => p.final_placement), [1, 1, 3]);
  assert.deepEqual(rankPlayers([player('a', 0, 100, 2), player('b', 0, 100, 2), player('c', 0, 50, 2)]).map(p => p.final_placement), [1, 1, 3]);
  assert.deepEqual(rankPlayers([player('a', 10, 0), player('b', 9, 5000)]).map(p => p.id), ['a', 'b']);
});

test('failed finalization rolls back damage, placements, and the final guess; retry finalizes once', async () => {
  const { pg, db } = await fresh();
  try {
    const s = services(db);
    const room = await db.multiplayer_rooms.create({ data: { max_health: 500, max_rounds: 1 } });
    const host = await s.joinRoom(room.id, 'Winner', '');
    await s.joinRoom(room.id, 'Joint second A', '');
    await s.joinRoom(room.id, 'Joint second B', '');
    const state = await s.transitionRoom(room.id, 'start', host.credential, null);
    const sessionId = state.currentSessionId;
    await openRound(db, sessionId);
    await (await s.GameSession.load(sessionId)).submitGuess(state.players[0].id, 'USA', 1000, 1);
    await (await s.GameSession.load(sessionId)).submitGuess(state.players[1].id, 'USA', 0, 1);
    const originalTransaction = db.$transaction;
    db.$transaction = work => originalTransaction(async tx => {
      const update = tx.multiplayer_games.update;
      tx.multiplayer_games.update = args => {
        if (args.data.status === 'finished') throw new Error('Simulated commit failure');
        return update(args);
      };
      return work(tx);
    });
    await assert.rejects((await s.GameSession.load(sessionId)).submitGuess(state.players[2].id, 'USA', 0, 1), /Simulated commit failure/);
    db.$transaction = originalTransaction;
    assert.equal(await db.multiplayer_guesses.count({ where: { game_id: sessionId } }), 2);
    assert.ok((await s.roomSnapshot(room.id)).players.every(p => p.health === 500 && p.finalPlacement === null));
    assert.ok((await s.memberStatistics(room.id)).every(m => m.sessionsPlayed === 0));
    await (await s.GameSession.load(sessionId)).submitGuess(state.players[2].id, 'USA', 0, 1);
    const finished = await s.roomSnapshot(room.id);
    assert.deepEqual(finished.players.map(p => p.finalPlacement), [1, 2, 2]);
    const stats = await s.memberStatistics(room.id);
    assert.deepEqual(stats.map(m => m.secondPlaces), [0, 1, 1]);
    assert.ok(stats.every(m => m.sessionsPlayed === 1));
  } finally { await pg.close(); }
});

async function openRound(db, id) {
  await db.multiplayer_games.update({ where: { id }, data: {
    round_starts_at: new Date(Date.now() - 1000), round_ends_at: new Date(Date.now() + 60000),
  } });
}

test('shared starts, early reveals, deadlines, and rematches use database time', async () => {
  const { pg, db } = await fresh();
  try {
    const s = services(db);
    const room = await db.multiplayer_rooms.create({ data: { max_health: 1000, max_rounds: 2, countdown_seconds: 30 } });
    const host = await s.joinRoom(room.id, 'Host', '');
    await s.joinRoom(room.id, 'Guest', '');
    let state = await s.transitionRoom(room.id, 'start', host.credential, null);
    const id = state.currentSessionId;
    function checkStart(snapshot) {
      const lead = Date.parse(snapshot.roundStartsAt) - Date.parse(snapshot.serverTime);
      assert.ok(lead > 4500 && lead <= 5000);
      assert.equal(Date.parse(snapshot.roundEndsAt) - Date.parse(snapshot.roundStartsAt), 30000);
      assert.equal(snapshot.resultsRevealAt, null);
    }
    checkStart(state);
    await rejected((await s.GameSession.load(id)).submitGuess(state.players[0].id, 'USA', 100, 1), 409);
    await openRound(db, id);
    for (const player of state.players) await (await s.GameSession.load(id)).submitGuess(player.id, 'USA', 100, 1);
    state = await s.roomSnapshot(room.id);
    assert.equal(state.currentRound, 2);
    assert.equal(state.roundHistory.length, 1);
    assert.equal(Date.parse(state.roundStartsAt) - Date.parse(state.resultsRevealAt), 20000);
    assert.equal(Date.parse(state.roundEndsAt) - Date.parse(state.roundStartsAt), 30000);
    assert.ok(Date.parse(state.resultsRevealAt) > Date.parse(state.serverTime));
    await rejected((await s.GameSession.load(id)).submitGuess(state.players[0].id, 'USA', 100, 2), 409);
    await openRound(db, id);
    await (await s.GameSession.load(id)).submitGuess(state.players[0].id, 'USA', 100, 2);
    await db.multiplayer_games.update({ where: { id }, data: { round_ends_at: new Date(0) } });
    // A skewed application clock must not suppress database deadline resolution.
    const RealDate = Date;
    global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [0])); } };
    try { await s.roomStatus(room.id); } finally { global.Date = RealDate; }
    await rejected((await s.GameSession.load(id)).submitGuess(state.players[1].id, 'USA', 100, 2), 409);
    state = await s.roomSnapshot(room.id);
    assert.equal(state.status, 'finished');
    assert.equal(state.roundHistory.length, 2);
    assert.deepEqual(state.players.map(p => p.cumulativeScore), [200, 100]);
    const recovered = await s.roomStatus(room.id);
    assert.deepEqual(recovered.players, state.players);
    assert.equal(recovered.resultsRevealAt, state.resultsRevealAt);
    state = await s.transitionRoom(room.id, 'reopen', host.credential, id);
    assert.equal(state.resultsRevealAt, null);
    checkStart(await s.transitionRoom(room.id, 'start', host.credential, id));
  } finally { await pg.close(); }
});

test('concurrent final submissions apply damage and history exactly once', async () => {
  const { pg, db } = await fresh();
  try {
    const s = services(db);
    const room = await db.multiplayer_rooms.create({ data: { max_health: 1000, max_rounds: 1 } });
    const host = await s.joinRoom(room.id, 'Host', '');
    await s.joinRoom(room.id, 'Guest', '');
    const state = await s.transitionRoom(room.id, 'start', host.credential, null);
    await openRound(db, state.currentSessionId);
    const sessions = await Promise.all(state.players.map(() => s.GameSession.load(state.currentSessionId)));
    await Promise.all(sessions.map((session, i) => session.submitGuess(state.players[i].id, 'USA', i ? 50 : 100, 1, false)));
    const finished = await s.roomStatus(room.id);
    assert.equal(finished.status, 'finished');
    assert.equal(finished.roundHistory.length, 1);
    assert.deepEqual(finished.players.map(p => [p.health, p.cumulativeScore]), [[1000, 100], [950, 50]]);
    assert.equal(await db.multiplayer_guesses.count({ where: { game_id: state.currentSessionId } }), 2);
    assert.equal((await s.roomStatus(room.id)).resultsRevealAt, finished.resultsRevealAt);
  } finally { await pg.close(); }
});

test('room status uses one consistent read in the lobby, countdown, and playing phases', async () => {
  const { pg, db } = await fresh();
  try {
    const s = services(db);
    const room = await db.multiplayer_rooms.create({ data: {} });
    const host = await s.joinRoom(room.id, 'Host', '');
    await s.joinRoom(room.id, 'Guest', '');
    const query = db.$queryRaw;
    let reads = 0;
    db.$queryRaw = (...args) => { reads++; return query(...args); };
    const check = async () => {
      reads = 0;
      const snapshot = await s.roomStatus(room.id);
      assert.equal(reads, 1);
      assert.ok(!JSON.stringify(snapshot).includes(host.credential));
      assert.ok(!JSON.stringify(snapshot).includes('credential_hash'));
      return snapshot;
    };
    assert.equal((await check()).status, 'waiting');
    const started = await s.transitionRoom(room.id, 'start', host.credential, null);
    assert.equal((await check()).roundStartsAt, started.roundStartsAt);
    await openRound(db, started.currentSessionId);
    const playing = await check();
    const expected = (await s.GameSession.load(started.currentSessionId)).getStatus();
    for (const key of Object.keys(expected)) {
      if (key !== 'revision' && key !== 'serverTime') assert.deepEqual(playing[key], expected[key], key);
    }
    await rejected(s.roomSnapshot(randomUUID()), 404);
  } finally { await pg.close(); }
});

test('broadcast reuses the prepared snapshot without publishing join credentials', async () => {
  const { pg, db } = await fresh();
  const originalFetch = global.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const s = services(db);
    const room = await db.multiplayer_rooms.create({ data: {} });
    const joined = await s.joinRoom(room.id, 'Host', '');
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
    let body;
    global.fetch = async (_url, options) => { body = JSON.parse(options.body); return { ok: true }; };
    db.$queryRaw = () => { throw new Error('Broadcast must not rebuild the snapshot'); };
    await s.broadcastRoom(room.id, joined);
    const { credential, memberId, ...publicSnapshot } = joined;
    assert.deepEqual(body.messages[0].payload, publicSnapshot);
    assert.equal(body.messages[0].topic, `room-${room.id}`);
    assert.ok(!JSON.stringify(body).includes(credential));
  } finally {
    global.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
    await pg.close();
  }
});

test('manual rooms hold results until a host advances the expected round', async () => {
  const { pg, db } = await fresh();
  try {
    const s = services(db);
    const room = await db.multiplayer_rooms.create({ data: { max_rounds: 2 } });
    const host = await s.joinRoom(room.id, 'Host', '');
    const guest = await s.joinRoom(room.id, 'Guest', '');
    assert.equal(host.autoAdvanceRounds, true);
    await rejected(s.transitionRoom(room.id, 'settings', guest.credential, null, undefined, { autoAdvanceRounds: false }), 403);
    await rejected(s.transitionRoom(room.id, 'settings', host.credential, null, undefined, { autoAdvanceRounds: 'false' }), 400);
    await s.transitionRoom(room.id, 'settings', host.credential, null, undefined, { autoAdvanceRounds: false });
    let state = await s.transitionRoom(room.id, 'start', host.credential, null);
    const id = state.currentSessionId;
    await rejected(s.transitionRoom(room.id, 'settings', host.credential, id, undefined, { autoAdvanceRounds: true }), 409);
    await openRound(db, id);
    for (const player of state.players) await (await s.GameSession.load(id)).submitGuess(player.id, 'USA', 100, 1);
    state = await s.roomStatus(room.id);
    assert.equal(state.awaitingHost, true);
    assert.equal(state.roundStartsAt, null);
    assert.equal(state.roundEndsAt, null);
    assert.equal(state.currentRound, 2);
    const revision = state.revision;
    await rejected((await s.GameSession.load(id)).submitGuess(state.players[0].id, 'USA', 100, 2), 409);
    assert.equal(await (await s.GameSession.load(id)).resolveRoundIfNeeded(), false);
    assert.equal((await s.roomStatus(room.id)).revision, revision);
    await rejected(s.transitionRoom(room.id, 'next-round', guest.credential, id, undefined, { expectedRound: 2 }), 403);
    await rejected(s.transitionRoom(room.id, 'next-round', host.credential, id, undefined, { expectedRound: 1 }), 409);
    await db.multiplayer_games.update({ where: { id }, data: { results_reveal_at: new Date(Date.now() - 1000) } });
    state = await s.transitionRoom(room.id, 'next-round', host.credential, id, undefined, { expectedRound: 2 });
    assert.equal(state.awaitingHost, false);
    assert.ok(Date.parse(state.roundStartsAt) > Date.parse(state.serverTime));
    assert.equal(Date.parse(state.roundEndsAt) - Date.parse(state.roundStartsAt), 60000);
    await rejected(s.transitionRoom(room.id, 'next-round', host.credential, id, undefined, { expectedRound: 2 }), 409);
    await openRound(db, id);
    for (const player of state.players) await (await s.GameSession.load(id)).submitGuess(player.id, 'USA', 100, 2);
    state = await s.roomStatus(room.id);
    assert.equal(state.status, 'finished');
    assert.equal(state.awaitingHost, false);
    state = await s.transitionRoom(room.id, 'reopen', host.credential, id);
    assert.equal(state.autoAdvanceRounds, false);
  } finally { await pg.close(); }
});
