import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

type Params = { params: Promise<{ gameId: string }> };

/**
 * GET /api/party/:gameId/archeologist
 *
 * Gets the archeologist name to return
 * Response: { nickname: 'sample' }
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;

    // 1. Fetch game to get the archeologist's player ID
    const game = await db.party_games.findUnique({
      where: { id: gameId },
      select: { archeologist: true },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (!game.archeologist) {
      return NextResponse.json(
        { error: 'Archeologist has not been assigned yet' },
        { status: 400 }
      );
    }

    // 2. Fetch the player name from party_players using game.archeologist (the player ID)
    const player = await db.party_players.findUnique({
      where: { id: game.archeologist },
      select: { name: true },
    });

    if (!player) {
      return NextResponse.json(
        { error: 'Archeologist player record not found' },
        { status: 404 }
      );
    }

    // 3. Return the player's name as nickname
    return NextResponse.json({ nickname: player.name });
  } catch (err) {
    console.error('[Get Archeologist Error]:', err);

    return NextResponse.json(
      {
        error: 'There was an error retrieving the archeologist name',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}