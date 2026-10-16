import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { broadcastReadiness } from '@/lib/multiplayer/broadcastReadiness';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: 'ok', db: 'connected', broadcast: broadcastReadiness().ready ? 'ready' : 'unavailable' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { status: 'error', db: 'unreachable', broadcast: broadcastReadiness().ready ? 'ready' : 'unavailable', detail: String(error) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
