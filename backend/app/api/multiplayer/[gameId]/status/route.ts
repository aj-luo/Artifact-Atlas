import { NextRequest, NextResponse } from 'next/server';
import { GameSession } from '@/lib/multiplayer/GameSession';

type Params = { params: Promise<{ gameId: string }> };

/**
 * GET /api/multiplayer/:gameId/status
 *
 * Returns the current game state. This endpoint drives the frontend polling
 * loop (every 1–2 seconds) and acts as the timer expiry trigger: when
 * round_ends_at has passed, this call will resolve the round even if no new
 * guesses arrive.
 *
 * Response: GameStatusResponse
 */
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;

    const session = await GameSession.load(gameId);
    if (!session) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Lazy timer resolution — if the round timer has expired and no more guesses
    // are coming in, polling this endpoint will eventually trigger the round end.
    await session.resolveRoundIfNeeded();

    return NextResponse.json(session.getStatus());
  } catch (err) {
    console.error('[multiplayer/status] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
