import { randomUUID } from 'node:crypto';
import { prepareNextArtifact } from '@/lib/multiplayer/artifactReservation';
import { authorizeGuess, broadcastRoom, credential, type GuessAuthorization } from '@/lib/multiplayer/Room';
import { after, NextRequest, NextResponse } from 'next/server';
import { GameSession, GameSessionError } from '@/lib/multiplayer/GameSession';

type Params = { params: Promise<{ gameId: string }> };

async function resolveAndBroadcast(context: GuessAuthorization, requestId: string, guessCommittedAt?: number) {
  const results = await GameSession.resolveAuthorizedRound(context, async (snapshot, committedAt) => {
    const publicationStarted = performance.now();
    await broadcastRoom(context.roomId, snapshot, { requestId, committedAt, kind: 'results' });
    console.info('[multiplayer/guess:results]', JSON.stringify({ requestId, roomId: context.roomId,
      sessionId: context.game.id, round: context.game.current_round, revision: snapshot.revision,
      finalGuessCommitToBroadcastMs: guessCommittedAt == null ? undefined : Math.round(publicationStarted - guessCommittedAt),
      finalGuessCommitToBroadcastCompleteMs: guessCommittedAt == null ? undefined : Math.round(performance.now() - guessCommittedAt) }));
  });
  if (results?.status === 'active' && results.currentSessionId) {
    await prepareNextArtifact(results.currentSessionId, results.currentRound);
  }
}

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
 *   resolution is scheduled after acknowledgement, so roundResolved
 *   may be false for the final accepted guess.
 *
 * Response: { score, roundResolved } + full GameStatusResponse
 */
export async function POST(req: NextRequest, { params }: Params) {
  const requestStarted = performance.now();
  const requestId = randomUUID();
  let roomId: string | null = null;
  let authorization: Awaited<ReturnType<typeof authorizeGuess>> | null = null;
  const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: {
    'X-Room-Processing-Ms': String(performance.now() - requestStarted),
    'X-Request-Id': requestId,
  } });
  try {
    const { gameId } = await params;
    const body = await req.json();
    if (!body || typeof body !== 'object') return respond({ error: 'Invalid request' }, 400);
    const { playerId, country, year } = body as {
      playerId?: string;
      country?:  string;
      year?:     number;
    };

    if (!playerId || !country || year === undefined) {
      return respond({ error: '"playerId", "country" (ISO alpha-3), and "year" are required' }, 400);
    }

    if (typeof country !== 'string' || !/^[a-z]{3}$/i.test(country) || !Number.isInteger(year) || year! < -3000 || year! > new Date().getFullYear() || !Number.isInteger(body.roundNumber)) {
      return respond({ error: 'Valid country, year, and roundNumber are required' }, 400);
    }
    const authorizationStarted = performance.now();
    authorization = await authorizeGuess(gameId, credential(req), playerId);
    roomId = authorization.roomId;
    const authorizationMs = performance.now() - authorizationStarted;
    const submitted = await GameSession.submitAuthorizedGuess(authorization, playerId, country, Number(year), body.roundNumber);
    const { score, roundResolved } = submitted.result;
    const authorizedRoomId = authorization.roomId;
    const snapshot = submitted.snapshot;
    const context = authorization;
    // One ordered pipeline keeps acceptance ahead of results. Revision gates on
    // clients also protect against other requests publishing out of order.
    after(async () => {
      await broadcastRoom(authorizedRoomId, snapshot, { requestId, kind: 'guess', committedAt: submitted.committedAt });
      if (submitted.allGuessed) await resolveAndBroadcast(context, requestId, submitted.committedAt);
    });

    console.info('[multiplayer/guess:timing]', JSON.stringify({
      requestId, region: process.env.VERCEL_REGION, roomId, sessionId: gameId, round: body.roundNumber, revision: snapshot.revision,
      authorizationMs: Math.round(authorizationMs),
      poolWaitMs: Math.round(submitted.timing.poolWaitMs),
      lockWaitMs: Math.round(submitted.timing.lockWaitMs),
      scoringMs: Math.round(submitted.timing.scoringMs),
      transactionMs: Math.round(submitted.timing.transactionMs),
      snapshotMs: Math.round(submitted.timing.snapshotMs),
      totalMs: Math.round(performance.now() - requestStarted),
      roundResolved,
    }));

    return respond({
      score,
      roundResolved,
      ...snapshot,
    });
  } catch (err) {
    if (err instanceof GameSessionError) {
      if (err.stateChanged && roomId) {
        const context = authorization;
        after(async () => {
          if (context) await resolveAndBroadcast(context, requestId);
        });
      }
      return respond({ error: err.message }, err.statusCode);
    }
    console.error('[multiplayer/guess] Unhandled error:', err);
    return respond({ error: 'Internal server error' }, 500);
  }
}
