import { after } from 'next/server';
import { GameSession } from './GameSession';

/** Keep the request alive long enough to attempt the non-fatal Realtime fast path. */
export function scheduleGameBroadcast(session: GameSession): void {
  after(async () => {
    await session.broadcastState();
  });
}
