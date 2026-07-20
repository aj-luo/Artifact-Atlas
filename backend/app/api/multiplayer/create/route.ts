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
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const countdownSeconds = typeof body.countdownSeconds === 'number' ? body.countdownSeconds : 20;
    const maxRounds        = typeof body.maxRounds        === 'number' ? Math.min(Math.max(body.maxRounds, 5), 20)        : 10;
    const maxHealth        = typeof body.maxHealth        === 'number' ? Math.min(Math.max(body.maxHealth, 5000), 20000)  : 25000;

    const game = await db.multiplayer_games.create({
      data: { countdown_seconds: countdownSeconds, max_rounds: maxRounds, max_health: maxHealth },
    });
    return NextResponse.json({ gameId: game.id }, { status: 201 });
  } catch (err) {
    console.error('[multiplayer/create] DB error:', err);
    return NextResponse.json({ error: 'Failed to create game' }, { status: 503 });
  }
}
