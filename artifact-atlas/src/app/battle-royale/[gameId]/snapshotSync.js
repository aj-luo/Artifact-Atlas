export function shouldApplyRevision(latestRevision, incomingRevision) {
  return Number.isInteger(incomingRevision) && incomingRevision >= latestRevision;
}

export function isResultsRevealPending(snapshot, serverNow) {
  return (snapshot?.status === 'finished' || snapshot?.status === 'active') && !!snapshot.resultsRevealAt
    && serverNow < Date.parse(snapshot.resultsRevealAt);
}

export function getRoundTimeRemaining(roundStartsAt, roundEndsAt, serverNow) {
  if (!roundEndsAt) return null;
  if (roundStartsAt && serverNow < new Date(roundStartsAt).getTime()) return null;
  return Math.max(0, Math.ceil((new Date(roundEndsAt).getTime() - serverNow) / 1000));
}

export function estimateServerClockOffset(serverTime, requestedAt, receivedAt, processingMs = 0) {
  const roundTrip = Math.max(0, receivedAt - requestedAt);
  const processing = Number.isFinite(processingMs) ? Math.min(roundTrip, Math.max(0, processingMs)) : 0;
  // serverTime is sampled near response creation, after database work. Remove
  // that processing time before estimating the response's network travel time.
  return Date.parse(serverTime) - (receivedAt - (roundTrip - processing) / 2);
}

export function getIntermissionPhase(roundStartsAt, serverNow) {
  if (!roundStartsAt) return { phase: 'none', countdown: null };
  const millisecondsRemaining = new Date(roundStartsAt).getTime() - serverNow;
  if (millisecondsRemaining <= 0) return { phase: 'none', countdown: null };
  if (millisecondsRemaining > 5000) return { phase: 'results', countdown: null };
  return {
    phase: 'countdown',
    countdown: Math.max(1, Math.ceil(millisecondsRemaining / 1000)),
  };
}

// Room revisions never reset when a new session starts.
export function shouldApplyRoomSnapshot(latestRevision, snapshot, roomId) {
  return snapshot?.roomId === roomId && shouldApplyRevision(latestRevision, snapshot.revision);
}

// Every rendered transition and input guard uses the same calibrated instant.
export function getRoomPhase(snapshot, serverNow) {
  const base = { countdown: null, timeRemaining: null, canGuess: false };
  if (isResultsRevealPending(snapshot, serverNow)) return { ...base, phase: 'syncing', revealPending: true };
  if (snapshot?.status !== 'active') return { ...base, phase: snapshot?.status ?? 'loading', revealPending: false };
  if (snapshot.awaitingHost) return { ...base, phase: 'results', revealPending: false };
  const intermission = getIntermissionPhase(snapshot.roundStartsAt, serverNow);
  if (intermission.phase !== 'none') return { ...base, ...intermission, revealPending: false };
  const timeRemaining = getRoundTimeRemaining(snapshot.roundStartsAt, snapshot.roundEndsAt, serverNow);
  return { ...base, phase: timeRemaining === 0 ? 'syncing' : 'playing', timeRemaining,
    canGuess: timeRemaining !== 0, revealPending: false };
}

export function getRecoveryPollInterval(channelStatus, statusError, phase) {
  if (channelStatus !== 'SUBSCRIBED' || statusError) return 2000;
  if (phase === 'finished') return 30000;
  return phase === 'playing' ? 5000 : 2000;
}
