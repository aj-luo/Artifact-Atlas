import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

type Params = { params: Promise<{ gameId: string }> };

/**
 * POST /api/party/:gameId/guess
 *
 * Body: { playerId: string }
 *
 * Checks if the chosen player is the archeologist and updates game status to 'done'
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;
    const body = await req.json();

    const playerId = typeof body?.playerId === 'string' ? body.playerId.trim() : '';

    if (!playerId) {
      return NextResponse.json(
        { error: 'playerId is required' },
        { status: 400 }
      );
    }

    // 1. Fetch the archeologist for this game
    const game = await db.party_games.findUnique({
      where: { id: gameId },
      select: { archeologist: true },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // 2. Compare the payload playerId to the stored archeologist ID
    const isArcheologist = String(game.archeologist) === playerId;

    // 3. Update the game status to 'done'
    await db.party_games.update({
      where: { id: gameId },
      data: { status: 'done' },
    });

    return NextResponse.json({ 
      success: true, 
      isArcheologist 
    }, { status: 200 });

  } catch (err) {
    console.error('[party/guess] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
