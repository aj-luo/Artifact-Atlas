import { NextRequest, NextResponse } from 'next/server';
import { GameSession, GameSessionError } from '@/lib/multiplayer/GameSession';

type Params = { params: Promise<{ gameId: string }> };

/**
 * POST /api/multiplayer/:gameId/join
 *
 * Body: { name: string }
 *
 * Adds a player to a waiting game and returns their playerId, which the
 * frontend should persist in localStorage for subsequent requests.
 *
 * Response: { playerId: string }
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;
    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const session = await GameSession.load(gameId);
    if (!session) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const { playerId } = await session.join(name);
    void session.broadcastState();
    return NextResponse.json({ playerId }, { status: 201 });
  } catch (err) {
    if (err instanceof GameSessionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[multiplayer/join] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
