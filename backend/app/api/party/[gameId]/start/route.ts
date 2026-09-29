import { NextRequest, NextResponse } from 'next/server';
import { GameSession, GameSessionError } from '@/lib/party/GameSession';
import { scheduleGameBroadcast } from '@/lib/party/scheduleBroadcast';

type Params = { params: Promise<{ gameId: string }> };

/**
 * POST /api/party/:gameId/start
 *
 * Transitions the game from 'waiting' to 'active', picks the first artifact,
 * and sets current_round = 1. Any player can start once 2+ players have joined.
 *
 * Response: { ok: true }
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;

    //parse JSON body from request
    const body = await _req.json();
    const { archeologist, guesser } = body;

    //some validation to make sure these yutes exist
    if (!archeologist || !guesser) {
      return NextResponse.json(
        { error: 'Missing required player IDs: archeologist and guesser' },
        { status: 400 }
      );
    }

    const session = await GameSession.load(gameId);
    if (!session) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    await session.start({ archeologist, guesser });
    return NextResponse.json({ ok: true, ...session.getStatus() });
  } catch (err) {
    if (err instanceof GameSessionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[party/start] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// This route is intentionally disabled while Party-mode start logic is
// incomplete. Exporting an empty module keeps Next's route type validator
// from attempting to import a script file.
export {};
