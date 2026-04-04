import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: 'ok', db: 'connected' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { status: 'error', db: 'unreachable', detail: String(error) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
