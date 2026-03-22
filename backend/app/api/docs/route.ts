import { NextResponse } from 'next/server';
import { swaggerSpec } from '@/lib/swagger';

/** GET /api/docs — serves the raw OpenAPI JSON spec */
export async function GET() {
  return NextResponse.json(swaggerSpec);
}
