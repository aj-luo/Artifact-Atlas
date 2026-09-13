import { authorizeGuess, broadcastRoom, credential, roomSnapshot, roomStatus } from '@/lib/multiplayer/Room';
import { after, NextRequest, NextResponse } from 'next/server';
import { GameSession, GameSessionError } from '@/lib/multiplayer/GameSession';
import { scheduleGameBroadcast } from '@/lib/multiplayer/scheduleBroadcast';

type Params = { params: Promise<{ gameId: string }> };

/**
 * POST /api/multiplayer/:gameId/guess
 *
 * Authorization: Bearer <room member credential>
 * Body: { playerId: string, country: string (ISO alpha-3), year: number, roundNumber: number }
 *
 * Submits a guess for the current round:
 * - Preserves the shared deadline established when the round starts.
 * - Calculates the geographic + temporal score.
 * - Resolves the round immediately if all active players have now guessed
 *   or the timer has already expired.
 *
 * Response: { score, roundResolved } + full GameStatusResponse
 */
export async function POST(req: NextRequest, { params }: Params) {
  let session: GameSession | null = null;
  try {
    const { gameId } = await params;
    const body = await req.json();
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
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

    if (typeof country !== 'string' || !/^[a-z]{3}$/i.test(country) || !Number.isInteger(year) || year! < -3000 || year! > new Date().getFullYear() || !Number.isInteger(body.roundNumber)) {
      return NextResponse.json({ error: 'Valid country, year, and roundNumber are required' }, { status: 400 });
    }
    const roomId = await authorizeGuess(gameId, credential(req), playerId);
    session = await GameSession.load(gameId);
    if (!session) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const { score, roundResolved } = await session.submitGuess(playerId, country, Number(year), body.roundNumber, false);
    const snapshot = await roomSnapshot(roomId);
    after(async () => {
      await broadcastRoom(roomId, snapshot);
    });
    // Concurrent submissions can complete a round without a prefetched artifact.
    // Resolve that case on the server, independently of client polling.
    if (!roundResolved && snapshot.status === 'active' && snapshot.players
      .filter(player => !player.isEliminated).every(player => 'hasGuessedThisRound' in player && player.hasGuessedThisRound)) {
      after(async () => {
        await broadcastRoom(roomId, await roomStatus(roomId));
      });
    }

    return NextResponse.json({
      score,
      roundResolved,
      ...snapshot,
    });
  } catch (err) {
    if (err instanceof GameSessionError) {
      if (err.stateChanged && session) scheduleGameBroadcast(session);
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode },
      );
    }
    console.error('[multiplayer/guess] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
