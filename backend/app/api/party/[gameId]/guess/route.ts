import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { GameSessionError, lockPartyGame } from '@/lib/party/GameSession';


type Params = { params: Promise<{ gameId: string }> };

/** POST /api/party/:gameId/guess */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;
    const body = await req.json();
    const playerId = typeof body?.playerId === 'string' ? body.playerId.trim() : '';

    if (!playerId) {
      return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
    }

    const isArcheologist = await db.$transaction(async (tx) => {
      const game = await lockPartyGame(tx, gameId);
      if (!game) throw new GameSessionError('Game not found', 404);
      if (game.status !== 'active') throw new GameSessionError('Game is not active', 409);

      await tx.party_games.update({
        where: { id: game.id },
        data: { status: 'done', revision: { increment: 1 } },
      });
      return String(game.archeologist) === playerId;
    });

    return NextResponse.json({ success: true, isArcheologist }, { status: 200 });
  } catch (err) {
    if (err instanceof GameSessionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[party/guess] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
