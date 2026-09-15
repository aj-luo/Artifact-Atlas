import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoomPhase, estimateServerClockOffset, getIntermissionPhase, getRoundTimeRemaining, isResultsRevealPending, shouldApplyRevision, shouldApplyRoomSnapshot } from './snapshotSync.js';

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
