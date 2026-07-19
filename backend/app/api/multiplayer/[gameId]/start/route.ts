import { NextRequest, NextResponse } from 'next/server';
import { GameSession, GameSessionError } from '@/lib/multiplayer/GameSession';

type Params = { params: Promise<{ gameId: string }> };

/**
 * POST /api/multiplayer/:gameId/start
 *
 * Transitions the game from 'waiting' to 'active', picks the first artifact,
 * and sets current_round = 1. Any player can start once 2+ players have joined.
 *
 * Response: { ok: true }
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;

    const session = await GameSession.load(gameId);
    if (!session) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    await session.start();
    void session.broadcastState();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GameSessionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[multiplayer/start] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
