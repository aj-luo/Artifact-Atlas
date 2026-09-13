import { NextResponse } from 'next/server';
import { sessionDetails } from '@/lib/multiplayer/history';
import { GameSessionError } from '@/lib/multiplayer/GameSession';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string; sessionId: string }> }) {
  try {
    const { roomId, sessionId } = await params;
    return NextResponse.json(await sessionDetails(roomId, sessionId));
  } catch (error) {
    if (error instanceof GameSessionError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error('[session details]', error);
    return NextResponse.json({ error: 'Unable to load session' }, { status: 500 });
  }
}
