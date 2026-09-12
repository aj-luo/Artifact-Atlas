import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateServerClockOffset, getIntermissionPhase, getRoundTimeRemaining, shouldApplyRevision } from './snapshotSync.js';

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
