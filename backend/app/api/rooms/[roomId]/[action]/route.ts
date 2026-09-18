import { after, NextResponse } from 'next/server';
import { GameSessionError } from '@/lib/multiplayer/GameSession';
import { broadcastRoom, credential, isUuid, joinRoom, roomStatus, transitionRoom } from '@/lib/multiplayer/Room';
import { memberStatistics, sessionHistory } from '@/lib/multiplayer/history';
import { db } from '@/lib/db';

type Params = { params: Promise<{ roomId: string; action: string }> };
export const dynamic = 'force-dynamic';
function failure(error: unknown) {
  if (error instanceof GameSessionError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  console.error('[rooms]', error);
  return NextResponse.json({ error: 'Unable to load or update room' }, { status: 500 });
}
export async function GET(req: Request, { params }: Params) {
  const requestedAt = performance.now();
  try {
    const { roomId, action } = await params;
    if (!isUuid(roomId)) throw new GameSessionError('Invalid room ID');
    if (action === 'status') {
      const snapshot = await roomStatus(roomId,
        snapshot => after(() => broadcastRoom(roomId, snapshot)));
      return NextResponse.json(snapshot, { headers: {
        'X-Room-Processing-Ms': String(performance.now() - requestedAt),
      } });
    }
    if (!await db.multiplayer_rooms.findUnique({ where: { id: roomId }, select: { id: true } })) throw new GameSessionError('Room not found', 404);
    if (action === 'statistics') return NextResponse.json({ members: await memberStatistics(roomId) });
    if (action === 'sessions') return NextResponse.json(await sessionHistory(roomId, new URL(req.url).searchParams));
    throw new GameSessionError('Not found', 404);
  } catch (error) { return failure(error); }
}
export async function POST(req: Request, { params }: Params) {
  try {
    const { roomId, action } = await params;
    if (!isUuid(roomId)) throw new GameSessionError('Invalid room ID');
    if (!['join', 'start', 'reopen', 'leave', 'remove', 'settings', 'next-round'].includes(action)) throw new GameSessionError('Not found', 404);
    const body = await req.json();
    if (!body || typeof body !== 'object') throw new GameSessionError('Invalid request');
    const snapshot = action === 'join' ? await joinRoom(roomId, body.name, credential(req))
      : await transitionRoom(roomId, action, credential(req), body.expectedSessionId, body.memberId, body);
    after(() => broadcastRoom(roomId, snapshot));
    return NextResponse.json(snapshot);
  } catch (error) { return failure(error); }
}
