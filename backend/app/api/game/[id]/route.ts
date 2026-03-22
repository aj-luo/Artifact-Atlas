import { NextRequest, NextResponse } from 'next/server';
import { gameStore } from '@/lib/gameStore';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/game/:gameId
 *
 * Returns current game state from memory — zero DB reads.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: gameId } = await params;

  const game = gameStore.get(gameId);
  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  return NextResponse.json({
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
  });
}
