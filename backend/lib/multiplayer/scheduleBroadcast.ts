import { after } from 'next/server';
import { GameSession } from './GameSession';
import { prepareNextArtifact } from './artifactReservation';

/** Keep the request alive long enough to attempt the non-fatal Realtime fast path. */
export function scheduleGameBroadcast(session: GameSession): void {
  after(async () => {
    await session.broadcastState();
    const snapshot = session.getStatus();
    if (snapshot.status === 'active') await prepareNextArtifact(snapshot.gameId, snapshot.currentRound);
  });
}
