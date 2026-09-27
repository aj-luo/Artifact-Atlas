import { authorizeGuess, broadcastRoom, credential, roomSnapshot, roomStatus } from '@/lib/multiplayer/Room';
import { after, NextRequest, NextResponse } from 'next/server';
import { GameSession, GameSessionError } from '@/lib/multiplayer/GameSession';

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
 * - Commits the guess and returns the room snapshot immediately. Round
 *   resolution is deferred to server-side status recovery, so roundResolved
 *   may be false for the final accepted guess.
 *
 * Response: { score, roundResolved } + full GameStatusResponse
 */
export async function POST(req: NextRequest, { params }: Params) {
  const requestStarted = performance.now();
  let roomId: string | null = null;
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
    const authorizationStarted = performance.now();
    const authorization = await authorizeGuess(gameId, credential(req), playerId);
    roomId = authorization.roomId;
    const authorizationMs = performance.now() - authorizationStarted;
    const submitted = await GameSession.submitAuthorizedGuess(authorization, playerId, country, Number(year), body.roundNumber);
    const { score, roundResolved } = submitted.result;
    const authorizedRoomId = authorization.roomId;
    const snapshot = await roomSnapshot(authorizedRoomId);
    after(async () => {
      await broadcastRoom(authorizedRoomId, snapshot);
    });
    // Resolve final/timed-out rounds on the server, independently of client polling.
    if (!roundResolved && snapshot.status === 'active') {
      after(async () => {
        await broadcastRoom(authorizedRoomId, await roomStatus(authorizedRoomId));
      });
    }

    console.info('[multiplayer/guess:timing]', JSON.stringify({
      authorizationMs: Math.round(authorizationMs),
      scoringMs: Math.round(submitted.timing.scoringMs),
      transactionMs: Math.round(submitted.timing.transactionMs),
      snapshotMs: Math.round(performance.now() - requestStarted - authorizationMs - submitted.timing.scoringMs - submitted.timing.transactionMs),
      totalMs: Math.round(performance.now() - requestStarted),
      roundResolved,
    }));

    return NextResponse.json({
      score,
      roundResolved,
      ...snapshot,
    });
  } catch (err) {
    if (err instanceof GameSessionError) {
      if (err.stateChanged && roomId) {
        after(async () => { await roomStatus(roomId!); });
      }
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode },
      );
    }
    console.error('[multiplayer/guess] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
