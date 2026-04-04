import { NextRequest, NextResponse } from 'next/server';
import { getGame } from '@/lib/gameStore';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/game/:gameId
 *
 * Returns current game state. Reads from the active_games DB table
 * so state persists across server restarts.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id: gameId } = await params;

    const game = await getGame(gameId);
    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        gameId:      game.gameId,
        status:      game.status,
        guessesLeft: game.guessesLeft,
        guesses:     game.guesses.map((g) => ({
          guessNumber: g.guessNumber,
          country:     g.country,
          year:        g.year,
          geo: {
            distanceKm: g.distanceKm,
            display:    g.geoDisplay,
          },
          yearHint:    g.yearHint,
          correct:     g.correct,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[game/get] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
