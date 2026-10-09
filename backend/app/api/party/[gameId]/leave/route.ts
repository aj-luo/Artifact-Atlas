import { NextRequest, NextResponse } from 'next/server';
import { GameSession, GameSessionError } from '@/lib/party/GameSession';

type Params = { params: Promise<{ gameId: string }> };

/** DELETE /api/party/:gameId/leave */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;
    const body = await req.json();
    const playerId = typeof body?.playerId === 'string' ? body.playerId.trim() : '';

    if (!playerId) {
      return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
    }

    const session = await GameSession.load(gameId);
    if (!session) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    await session.leave(playerId);
    return NextResponse.json({ ok: true, ...session.getStatus() });
  } catch (err) {
    if (err instanceof GameSessionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[party/leave] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
