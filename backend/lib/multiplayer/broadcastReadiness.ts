const warningIntervalMs = 60_000;
let lastMissingWarning = 0;

export function broadcastReadiness() {
  const missing = (['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const)
    .filter(name => !process.env[name]?.trim());
  return { ready: missing.length === 0, missing };
}

export function reportBroadcastConfiguration(roomId?: string) {
  const readiness = broadcastReadiness();
  if (readiness.ready) return true;
  const now = Date.now();
  if (!lastMissingWarning || now - lastMissingWarning >= warningIntervalMs) {
    lastMissingWarning = now;
    console.error('[multiplayer/broadcast:unavailable]', JSON.stringify({
      roomId, missing: readiness.missing,
    }));
  }
  return false;
}
