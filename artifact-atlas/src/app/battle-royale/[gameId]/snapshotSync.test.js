import test from 'node:test';
import assert from 'node:assert/strict';
import { getFrozenRoundTimer, getRecoveryPollInterval, getRoomPhase, estimateServerClockOffset, getIntermissionPhase, getRoundTimeRemaining, isResultsRevealPending, shouldApplyRevision, shouldApplyRoomSnapshot } from './snapshotSync.js';

const timerSnapshot = {
  roomId: 'room', currentSessionId: 'session', currentRound: 1, revision: 1, status: 'active',
  roundStartsAt: new Date(0).toISOString(), roundEndsAt: new Date(60000).toISOString(),
  players: [{ hasGuessedThisRound: true }, { hasGuessedThisRound: false },
    { isEliminated: true, hasGuessedThisRound: false }],
};
const allGuessedSnapshot = { ...timerSnapshot,
  players: timerSnapshot.players.map(player => player.isEliminated ? player : { ...player, hasGuessedThisRound: true }) };

test('the display counts down while others play and freezes throughout ten seconds of results loading', () => {
  assert.equal(getFrozenRoundTimer(null, timerSnapshot, 45000), null);
  assert.equal(getRoomPhase(timerSnapshot, 45000).timeRemaining, 15);
  assert.equal(getFrozenRoundTimer(null, timerSnapshot, 46000), null);
  assert.equal(getRoomPhase(timerSnapshot, 46000).timeRemaining, 14);
  const frozen = getFrozenRoundTimer(null, allGuessedSnapshot, 55000);
  assert.equal(frozen.seconds, 5);
  for (let now = 55000; now <= 65000; now += 1000) {
    assert.equal(getFrozenRoundTimer(frozen, allGuessedSnapshot, now).seconds, 5);
  }
  assert.equal(getRoomPhase(allGuessedSnapshot, 65000).timeRemaining, 0);
  assert.equal(getRoomPhase(allGuessedSnapshot, 65000).canGuess, false);
});

test('expiry freezes at zero and the next round gets a fresh authoritative countdown', () => {
  const frozen = getFrozenRoundTimer(null, allGuessedSnapshot, 60000);
  assert.equal(frozen.seconds, 0);
  assert.equal(getFrozenRoundTimer(frozen, allGuessedSnapshot, 70000).seconds, 0);
  const nextRound = { ...timerSnapshot, currentRound: 2,
    roundStartsAt: new Date(80000).toISOString(), roundEndsAt: new Date(140000).toISOString() };
  assert.equal(getFrozenRoundTimer(frozen, nextRound, 75000), null);
  assert.equal(getRoomPhase(nextRound, 75000).countdown, 5);
  assert.equal(getFrozenRoundTimer(frozen, nextRound, 80000), null);
  assert.equal(getRoomPhase(nextRound, 80000).timeRemaining, 60);
});

test('a frozen value resets across rooms, sessions, rounds, and results phases', () => {
  const frozen = getFrozenRoundTimer(null, allGuessedSnapshot, 45000);
  for (const change of [{ roomId: 'other-room' }, { currentSessionId: 'rematch' }, { currentRound: 2 },
    { status: 'waiting' }, { status: 'finished' }, { awaitingHost: true },
    { resultsRevealAt: new Date(50000).toISOString() }, { roundStartsAt: new Date(50000).toISOString() }]) {
    assert.equal(getFrozenRoundTimer(frozen, { ...timerSnapshot, ...change }, 45000), null);
  }
  assert.equal(getFrozenRoundTimer(null, { ...allGuessedSnapshot, players: [] }, 45000), null);
});

test('delayed snapshots cannot restore a freeze from an earlier round', () => {
  let snapshot = allGuessedSnapshot;
  let frozen = getFrozenRoundTimer(null, snapshot, 45000);
  const apply = incoming => {
    if (!shouldApplyRoomSnapshot(snapshot.revision, incoming, snapshot.roomId)) return;
    snapshot = incoming;
    frozen = getFrozenRoundTimer(frozen, incoming, 46000);
  };
  apply({ ...timerSnapshot, currentRound: 2, revision: 2 });
  assert.equal(frozen, null);
  apply(allGuessedSnapshot);
  assert.equal(snapshot.currentRound, 2);
  assert.equal(frozen, null);
});

test('finished results share a reveal deadline across clock offsets and late arrivals', () => {
  const revealAt = Date.parse('2026-09-12T12:00:20.000Z');
  const snapshot = { status: 'finished', resultsRevealAt: new Date(revealAt).toISOString() };
  for (const offset of [-5000, 0, 5000]) {
    const localNow = revealAt - 1000 - offset;
    assert.equal(isResultsRevealPending(snapshot, localNow + offset), true);
    assert.equal(isResultsRevealPending(snapshot, localNow + offset + 1000), false);
  }
  assert.equal(isResultsRevealPending(snapshot, revealAt + 5000), false);
  assert.equal(isResultsRevealPending({ status: 'finished' }, revealAt), false);
  assert.equal(isResultsRevealPending({ ...snapshot, status: 'active' }, revealAt - 1), true);
});

test('an older HTTP snapshot cannot overwrite a newer broadcast', () => {
  assert.equal(shouldApplyRevision(8, 7), false);
  assert.equal(shouldApplyRevision(8, 8), true);
  assert.equal(shouldApplyRevision(8, 9), true);
});

test('intermission phases are derived from the authoritative start timestamp', () => {
  const start = Date.parse('2026-07-22T12:00:20.000Z');
  assert.deepEqual(getIntermissionPhase(new Date(start).toISOString(), start - 20_000), { phase: 'results', countdown: null });
  assert.deepEqual(getIntermissionPhase(new Date(start).toISOString(), start - 15_000), { phase: 'results', countdown: null });
  assert.deepEqual(getIntermissionPhase(new Date(start).toISOString(), start - 5001), { phase: 'results', countdown: null });
  assert.deepEqual(getIntermissionPhase(new Date(start).toISOString(), start - 5000), { phase: 'countdown', countdown: 5 });
  assert.deepEqual(getIntermissionPhase(new Date(start).toISOString(), start - 4000), { phase: 'countdown', countdown: 4 });
  assert.deepEqual(getIntermissionPhase(new Date(start).toISOString(), start - 1), { phase: 'countdown', countdown: 1 });
  assert.deepEqual(getIntermissionPhase(new Date(start).toISOString(), start), { phase: 'none', countdown: null });
  assert.deepEqual(getIntermissionPhase(null, start), { phase: 'none', countdown: null });
});

test('clock offset uses the request midpoint to tolerate network latency', () => {
  const requestedAt = Date.parse('2026-07-22T12:00:00.000Z');
  const receivedAt = requestedAt + 200;
  const serverTime = new Date(requestedAt + 5100).toISOString();
  assert.equal(estimateServerClockOffset(serverTime, requestedAt, receivedAt), 5000);
});

test('guessing windows begin after intermission and expire at the shared deadline', () => {
  const start = Date.parse('2026-09-12T12:00:20.000Z');
  for (const duration of [30, 60, 120]) {
    const startsAt = new Date(start).toISOString();
    const endsAt = new Date(start + duration * 1000).toISOString();
    assert.equal(getRoundTimeRemaining(startsAt, endsAt, start - 1), null);
    assert.equal(getRoundTimeRemaining(startsAt, endsAt, start), duration);
    assert.equal(getRoundTimeRemaining(startsAt, endsAt, start + 1000), duration - 1);
    assert.equal(getRoundTimeRemaining(startsAt, endsAt, start + duration * 1000 - 1), 1);
    assert.equal(getRoundTimeRemaining(startsAt, endsAt, start + duration * 1000), 0);
    assert.equal(getRoundTimeRemaining(startsAt, endsAt, start + duration * 1000 + 5000), 0);
  }
  assert.equal(getRoundTimeRemaining(null, null, start), null);
});

test('room revisions reject delayed prior-session snapshots and recover after reconnect', () => {
  const oldSession = { roomId: 'room', currentSessionId: 'first', revision: 10 };
  const rematch = { roomId: 'room', currentSessionId: 'second', revision: 15 };
  assert.equal(shouldApplyRoomSnapshot(oldSession.revision, rematch, 'room'), true);
  assert.equal(shouldApplyRoomSnapshot(rematch.revision, oldSession, 'room'), false);
  assert.equal(shouldApplyRoomSnapshot(-1, rematch, 'room'), true);
  assert.equal(shouldApplyRoomSnapshot(-1, rematch, 'another-room'), false);
  assert.equal(shouldApplyRoomSnapshot(15, { ...rematch, revision: undefined }, 'room'), false);
});

test('one phase gates exact reveal, countdown, start, and cutoff boundaries', () => {
  const snapshot = { status: 'active', resultsRevealAt: new Date(10000).toISOString(),
    roundStartsAt: new Date(30000).toISOString(), roundEndsAt: new Date(60000).toISOString() };
  for (const offset of [-5000, 0, 5000]) {
    for (const [now, phase, canGuess] of [[9999, 'syncing', false], [10000, 'results', false],
      [24999, 'results', false], [25000, 'countdown', false], [29999, 'countdown', false],
      [30000, 'playing', true], [59999, 'playing', true], [60000, 'syncing', false], [90000, 'syncing', false]]) {
      const localNow = now - offset;
      const result = getRoomPhase(snapshot, localNow + offset);
      assert.equal(result.phase, phase);
      assert.equal(result.canGuess, canGuess);
    }
  }
  assert.equal(getRoomPhase({ ...snapshot, resultsRevealAt: null }, 9999).phase, 'results');
  assert.equal(getRoomPhase({ ...snapshot, status: 'waiting' }, 20000).canGuess, false);
});

test('slow database work is not mistaken for clock skew at round start', () => {
  const requestedAt = 10000;
  const processingMs = 2000;
  const receivedAt = requestedAt + processingMs + 100;
  const serverOffset = 5000;
  const serverTime = new Date(requestedAt + 50 + processingMs + serverOffset).toISOString();
  assert.equal(estimateServerClockOffset(serverTime, requestedAt, receivedAt, processingMs), serverOffset);
  assert.equal(estimateServerClockOffset(serverTime, requestedAt, receivedAt), serverOffset + 1000);
  assert.ok(Number.isFinite(estimateServerClockOffset(serverTime, requestedAt, receivedAt, NaN)));
});

test('missed broadcasts recover promptly even when the channel reports subscribed', () => {
  assert.equal(getRecoveryPollInterval('SUBSCRIBED', null, 'playing'), 5000);
  for (const phase of ['waiting', 'countdown', 'results', 'syncing']) {
    assert.equal(getRecoveryPollInterval('SUBSCRIBED', null, phase), 2000);
  }
  assert.equal(getRecoveryPollInterval('CHANNEL_ERROR', null, 'playing'), 2000);
  assert.equal(getRecoveryPollInterval('SUBSCRIBED', 'Refresh failed', 'playing'), 2000);
  assert.equal(getRecoveryPollInterval('SUBSCRIBED', null, 'finished'), 30000);
});

test('manual results stay visible and guesses stay disabled until the host starts the countdown', () => {
  const now = Date.now();
  const snapshot = { status: 'active', awaitingHost: true, resultsRevealAt: new Date(now + 1000).toISOString() };
  assert.equal(getRoomPhase(snapshot, now).phase, 'syncing');
  assert.equal(getRoomPhase(snapshot, now + 3600000).phase, 'results');
  assert.equal(getRoomPhase(snapshot, now + 3600000).canGuess, false);
  const started = { ...snapshot, awaitingHost: false, roundStartsAt: new Date(now + 5000).toISOString(), roundEndsAt: new Date(now + 65000).toISOString() };
  assert.equal(getRoomPhase(started, now + 1000).phase, 'countdown');
  assert.equal(getRoomPhase(started, now + 5000).canGuess, true);
});
