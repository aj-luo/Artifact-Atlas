import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

type Params = { params: Promise<{ gameId: string }> };

type DescriptionEntry = {
  explanation: string;
  nickname: string;
};

/**
 * POST /api/party/:gameId/submit
 *
 * Body: { playerId: string, explanation: string, nickname?: string }
 *
 * Directly updates the `descriptions` JSONB object in `party_games`
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;
    const body = await req.json();

    const playerId = typeof body?.playerId === 'string' ? body.playerId.trim() : '';
    const explanation = typeof body?.explanation === 'string' ? body.explanation.trim() : '';
    const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : 'Anonymous';

    if (!playerId || !explanation) {
      return NextResponse.json(
        { error: 'playerId and explanation are required' },
        { status: 400 }
      );
    }

    // 1. Fetch current descriptions for this game
    const game = await db.party_games.findUnique({
      where: { id: gameId },
      select: { descriptions: true },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // 2. Merge new description entry into existing JSONB descriptions object
    const currentDescriptions = (game.descriptions as Record<string, DescriptionEntry | string>) || {};
    
    const updatedDescriptions = {
      ...currentDescriptions,
      [playerId]: {
        explanation,
        nickname,
      },
    };

    // 3. Update the database record
    const updatedGame = await db.party_games.update({
      where: { id: gameId },
      data: { descriptions: updatedDescriptions },
    });

    return NextResponse.json({
      success: true,
      game: { ...updatedGame, object_id: updatedGame.object_id?.toString() ?? null },
    }, { status: 200 });

  } catch (err) {
    console.error('[party/submit] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
