import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { GameSessionError, lockPartyGame } from '@/lib/party/GameSession';

type Params = { params: Promise<{ gameId: string }> };

type DescriptionEntry = {
  explanation: string;
  nickname: string;
};

/** POST /api/party/:gameId/submit */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;
    const body = await req.json();
    const playerId = typeof body?.playerId === 'string' ? body.playerId.trim() : '';
    const explanation = typeof body?.explanation === 'string' ? body.explanation.trim() : '';
    const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : 'Anonymous';

    if (!playerId || !explanation) {
      return NextResponse.json({ error: 'playerId and explanation are required' }, { status: 400 });
    }

    const updatedGame = await db.$transaction(async (tx) => {
      const game = await lockPartyGame(tx, gameId);
      if (!game) throw new GameSessionError('Game not found', 404);
      if (game.status !== 'active') throw new GameSessionError('Game is not active', 409);

      const currentDescriptions = (game.descriptions ?? {}) as Record<string, DescriptionEntry | string>;
      const updatedDescriptions = {
        ...currentDescriptions,
        [playerId]: { explanation, nickname },
      } as Prisma.InputJsonValue;

      return tx.party_games.update({
        where: { id: gameId },
        data: { descriptions: updatedDescriptions, revision: { increment: 1 } },
      });
    });

    return NextResponse.json({
      success: true,
      game: {
        ...updatedGame,
        object_id: updatedGame.object_id?.toString() ?? null,
      },
    }, { status: 200 });
  } catch (err) {
    if (err instanceof GameSessionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[party/submit] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
