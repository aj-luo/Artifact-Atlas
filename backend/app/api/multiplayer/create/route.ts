import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/multiplayer/create
 *
 * Creates a persistent room in 'waiting' state. Sessions are created on start.
 * Share the returned gameId with other players so they can join.
 *
 * Response: { gameId: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) ?? {};
    const countdownSeconds = body.countdownSeconds === undefined ? 60 : body.countdownSeconds;
    if (!Number.isInteger(countdownSeconds) || countdownSeconds < 30 || countdownSeconds > 120) {
      return NextResponse.json({ error: 'Round duration must be an integer between 30 and 120 seconds' }, { status: 400 });
    }
    if ((body.maxRounds !== undefined && !Number.isInteger(body.maxRounds)) || (body.maxHealth !== undefined && !Number.isInteger(body.maxHealth))) return NextResponse.json({ error: 'Settings must be integers' }, { status: 400 });
    const maxRounds        = typeof body.maxRounds        === 'number' ? Math.min(Math.max(body.maxRounds, 5), 20)        : 10;
    const maxHealth        = typeof body.maxHealth        === 'number' ? Math.min(Math.max(body.maxHealth, 5000), 20000)  : 25000;

    const game = await db.multiplayer_rooms.create({
      data: { countdown_seconds: countdownSeconds, max_rounds: maxRounds, max_health: maxHealth },
    });
    return NextResponse.json({ gameId: game.id, roomId: game.id }, { status: 201 });
  } catch (err) {
    console.error('[multiplayer/create] DB error:', err);
    return NextResponse.json({ error: 'Failed to create game' }, { status: 503 });
  }
}
