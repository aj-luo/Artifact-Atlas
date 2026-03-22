import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/report
 *
 * Body:
 * {
 *   "objectId":            "12345",
 *   "is_date_incorrect":     true,
 *   "is_location_incorrect": false,
 *   "description":           "The date shown is wrong — this piece is from 1820."
 * }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { objectId, is_date_incorrect, is_location_incorrect, description } = body as {
    objectId?: string;
    is_date_incorrect?: boolean;
    is_location_incorrect?: boolean;
    description?: string;
  };

  if (!objectId) {
    return NextResponse.json({ error: '"objectId" is required' }, { status: 400 });
  }
  if (!is_date_incorrect && !is_location_incorrect && !description) {
    return NextResponse.json(
      { error: 'At least one of is_date_incorrect, is_location_incorrect, or description must be provided' },
      { status: 400 },
    );
  }

  // Verify the artifact exists
  const artifact = await db.metObjects.findUnique({
    where: { Object_ID: BigInt(objectId) },
    select: { Object_ID: true },
  });
  if (!artifact) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
  }

  const report = await db.reported_inaccurate.create({
    data: {
      object_id:            BigInt(objectId),
      is_date_incorrect:    is_date_incorrect     ?? false,
      is_location_incorrect: is_location_incorrect ?? false,
      description:          description ?? null,
    },
  });

  return NextResponse.json(
    { id: report.id.toString(), message: 'Report submitted' },
    { status: 201 },
  );
}
