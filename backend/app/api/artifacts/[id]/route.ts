import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// DELETE is disabled
export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

type Params = { params: Promise<{ id: string }> };

/** GET /api/artifacts/:id — returns public MetObjects fields (no answer spoilers) */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const artifact = await db.metObjects.findUnique({
    where: { Object_ID: BigInt(id) },
    select: {
      Object_ID:                true,
      Title:                    true,
      Object_Name:              true,
      Culture:                  true,
      Period:                   true,
      Classification:           true,
      Primary_Image_URL:        true,
      Primary_Image_Small_URL:  true,
      Tags:                     true,
    },
  });

  if (!artifact) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    ...artifact,
    Object_ID: artifact.Object_ID.toString(),
  });
}
