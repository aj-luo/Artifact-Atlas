import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/multiplayer/Room';

type Params = { params: Promise<{ gameId: string }> };

/**
 * GET /api/multiplayer/:gameId/exists
 *
 * Lightweight existence check — does not trigger round resolution.
 * Used by the lobby page to validate a game code before navigating.
 *
 * Response: { exists: true, status: 'waiting' | 'active' | 'finished' }
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;
    const session = isUuid(gameId) ? await db.multiplayer_rooms.findUnique({ where: { id: gameId } }) : null;
    if (!session) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }
    const { status } = session;
    return NextResponse.json({ exists: true, status });
  } catch (err) {
    console.error('[multiplayer/exists] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
