export function shouldApplyRevision(latestRevision, incomingRevision) {
  return Number.isInteger(incomingRevision) && incomingRevision >= latestRevision;
}

export function estimateServerClockOffset(serverTime, requestedAt, receivedAt) {
  const midpoint = requestedAt + ((receivedAt - requestedAt) / 2);
  return new Date(serverTime).getTime() - midpoint;
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
