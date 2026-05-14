import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/multiplayer/create
 *
 * Creates a new multiplayer game lobby in 'waiting' state.
 * Share the returned gameId with other players so they can join.
 *
 * Response: { gameId: string }
 */
export async function POST() {
  try {
    const game = await db.multiplayer_games.create({ data: {} });
    return NextResponse.json({ gameId: game.id }, { status: 201 });
  } catch (err) {
    console.error('[multiplayer/create] DB error:', err);
    return NextResponse.json({ error: 'Failed to create game' }, { status: 503 });
  }
}
