import { NextRequest, NextResponse } from 'next/server';
import { GameSession, GameSessionError } from '@/lib/party/GameSession';
import { scheduleGameBroadcast } from '@/lib/party/scheduleBroadcast';

type Params = { params: Promise<{ gameId: string }> };

/**
 * POST /api/party/:gameId/join
 *
 * Body: { name: string }
 *
 * Adds a player to a waiting game and returns their playerId, which the
 * frontend should persist in localStorage for subsequent requests.
 *
 * Response: { playerId: string }
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    //get the gameId from the route parameters
    const { gameId } = await params;
    //get the request body as JSON, default to empty object if parsing fails
    const body = await req.json();
    //get the name from the request JSON
    const name = typeof body?.name === 'string' ? body.name.trim() : '';

    //if name is not sent in body, return a 400 Bad Request response with an error message
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    //get the game session object from the database using the gameId, if it doesn't exist return a 404 Not Found response with an error message
    const session = await GameSession.load(gameId);
    if (!session) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    //add the player to the game session with their name and return their playerId in the response with status 201 Created
    const { playerId } = await session.join(name);
    //return the playerId and the current game status in the response with status 201 Created
    return NextResponse.json({ playerId, ...session.getStatus() }, { status: 201 });
  } catch (err) {
    if (err instanceof GameSessionError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[party/join] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
