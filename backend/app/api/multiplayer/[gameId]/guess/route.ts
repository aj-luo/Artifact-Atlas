import { NextRequest, NextResponse } from 'next/server';
import { GameSession, GameSessionError } from '@/lib/multiplayer/GameSession';

type Params = { params: Promise<{ gameId: string }> };

/**
 * POST /api/multiplayer/:gameId/guess
 *
 * Body: { playerId: string, country: string (ISO alpha-3), year: number }
 *
 * Submits a guess for the current round:
 * - Starts the 20s round timer on the first guess.
 * - Calculates the geographic + temporal score.
 * - Resolves the round immediately if all active players have now guessed
 *   or the timer has already expired.
 *
 * Response: { score, roundResolved } + full GameStatusResponse
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;
    const body = await req.json();
    const { playerId, country, year } = body as {
      playerId?: string;
      country?:  string;
      year?:     number;
    };

    if (!playerId || !country || year === undefined) {
      return NextResponse.json(
        { error: '"playerId", "country" (ISO alpha-3), and "year" are required' },
        { status: 400 },
      );
    }

    const session = await GameSession.load(gameId);
    if (!session) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const { score, roundResolved } = await session.submitGuess(playerId, country, Number(year));
    void session.broadcastState();

    return NextResponse.json({
      score,
      roundResolved,
      ...session.getStatus(),
    });
  } catch (err) {
    if (err instanceof GameSessionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[multiplayer/guess] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
