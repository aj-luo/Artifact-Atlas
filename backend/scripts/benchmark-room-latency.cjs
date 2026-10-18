// Creates isolated benchmark rooms on the supplied deployment. Never deletes data.
// Run from backend with --env-file=.env.local for public Supabase connection settings.
const { createClient } = require('@supabase/supabase-js');
const { setTimeout: delay } = require('node:timers/promises');
const base = process.argv[2]?.replace(/\/$/, '');
const runs = Number(process.env.BENCH_RUNS ?? 20);
const sizes = (process.env.BENCH_PLAYERS ?? '2,10,20').split(',').map(Number);
const label = process.env.BENCH_LABEL ?? 'warm';
if (!base || !Number.isInteger(runs) || runs < 1 || sizes.some(n => !Number.isInteger(n) || n < 2 || n > 20)) {
  console.error('Usage: BENCH_RUNS=20 node --env-file=.env.local scripts/benchmark-room-latency.cjs https://deployment');
  process.exit(1);
}
const samples = [];
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;
const summarize = values => ({ n: values.length, p50: percentile(values, .5), p95: percentile(values, .95) });
async function request(path, body, token) {
  const started = Date.now();
  const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST',
    signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  const received = Date.now();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${data.error}`);
  const processing = Number(response.headers.get('X-Room-Processing-Ms') ?? 0);
  const offset = data.serverTime ? Date.parse(data.serverTime) - (received - Math.max(0, received - started - processing) / 2) : 0;
  return { data, started, received, ms: received - started, processing, offset, requestId: response.headers.get('X-Request-Id') };
}
async function run(players, iteration) {
  const { data: room } = await request('/api/multiplayer/create', { maxHealth: 20000, maxRounds: 5, autoAdvanceRounds: false, countdownSeconds: 120 });
  const host = (await request(`/api/rooms/${room.roomId}/join`, { name: 'Latency host' })).data;
  const members = [host, ...await Promise.all(Array.from({ length: players - 1 }, async (_, i) =>
    (await request(`/api/rooms/${room.roomId}/join`, { name: `Latency ${i + 1}` })).data))];
  const clients = [], receipts = [];
  const session = { id: null };
  let latestRevision = -1;
  try {
    await Promise.all(members.map(async (_, index) => {
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } });
      clients.push(client);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Realtime subscription timed out')), 20000);
        client.channel(`room-${room.roomId}`).on('broadcast', { event: 'room_update' }, ({ payload }) => {
          if (payload.currentSessionId !== session.id || payload.lastRoundReveal?.round !== 1) return;
          latestRevision = Math.max(latestRevision, payload.revision);
          if (!receipts[index]) receipts[index] = { received: Date.now(), revision: payload.revision, revealAt: payload.resultsRevealAt };
        }).subscribe(status => {
          if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(status)); }
        });
      });
    }));
    const started = await request(`/api/rooms/${room.roomId}/start`, { expectedSessionId: null }, host.credential);
    session.id = started.data.currentSessionId;
    // A fresh status response supplies a calibrated server clock before submitting.
    const clock = await request(`/api/rooms/${room.roomId}/status`);
    await delay(Math.max(0, Date.parse(clock.data.roundStartsAt) - Date.now() - clock.offset + 100));
    const guesses = await Promise.all(members.map(member => request(`/api/multiplayer/${session.id}/guess`, {
      playerId: started.data.players.find(p => p.memberId === member.memberId).id,
      country: 'USA', year: 1900, roundNumber: 1,
    }, member.credential)));
    // Do not poll until measuring the broadcast fast path has finished: polling drives recovery.
    const deadline = Date.now() + 15000;
    while (receipts.filter(Boolean).length < players && Date.now() < deadline) await delay(20);
    const recovery = await request(`/api/rooms/${room.roomId}/status`);
    const sample = { deployment: base, label, players, iteration, roomId: room.roomId, sessionId: session.id,
      guessAckMs: guesses.map(g => g.ms), guessProcessingMs: guesses.map(g => g.processing),
      requestIds: guesses.map(g => g.requestId), latestRevision, broadcastsReceived: receipts.filter(Boolean).length,
      // ServerTime precedes commit. This is a client-side estimate, not the authoritative server metric.
      estimatedFinalCommitAt: Math.max(...guesses.map(g => Date.parse(g.data.serverTime) - clock.offset)),
      receipts, recoveryRevision: recovery.data.revision };
    sample.estimatedCommitToReceiptMs = receipts.filter(Boolean).map(r => r.received - sample.estimatedFinalCommitAt);
    sample.estimatedCommitToVisibleMs = receipts.filter(Boolean).map(r =>
      Math.max(r.received, Date.parse(r.revealAt) - clock.offset) - sample.estimatedFinalCommitAt);
    samples.push(sample);
    console.log(JSON.stringify({ type: 'sample', ...sample }));
  } finally { await Promise.all(clients.map(client => client.removeAllChannels())); }
}
(async () => {
  for (const players of sizes) for (let iteration = 1; iteration <= runs; iteration++) await run(players, iteration);
  for (const players of sizes) {
    const group = samples.filter(s => s.players === players);
    console.log(JSON.stringify({ type: 'summary', deployment: base, label, players, runs: group.length,
      guessAckMs: summarize(group.flatMap(s => s.guessAckMs)),
      guessProcessingMs: summarize(group.flatMap(s => s.guessProcessingMs)),
      estimatedCommitToReceiptMs: summarize(group.flatMap(s => s.estimatedCommitToReceiptMs)),
      estimatedCommitToVisibleMs: summarize(group.flatMap(s => s.estimatedCommitToVisibleMs)),
      missedBroadcasts: group.reduce((n, s) => n + players - s.broadcastsReceived, 0) }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
