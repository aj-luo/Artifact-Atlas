import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

type Params = { params: Promise<{ gameId: string }> };

/**
 * PATCH /api/party/:gameId/reset
 *
 * Resets the game using the same gameId, it will reset the artifacts etc. and make the guesser and archeologist blank
 *
 * We want to change status to waiting again, we want to change object_id, set descriptions to null
 * artifact_url, artifact_title, artifact_image_url to null, archeologist and guesser to null
 * Response: { ok: true }
 */
export async function PATCH(_req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;

    // Check if the game session exists
    const game = await db.party_games.findUnique({
      where: { id: gameId },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Reset game row in the database
    await db.party_games.update({
      where: { id: gameId },
      data: {
        status: 'waiting',
        object_id: null,
        descriptions: undefined,
        archeologist: null,
        guesser: null,
        artifact_url: null,
        artifact_title: null,
        artifact_image_url: null,
        revision: { increment: 1 },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Update Table Error]:', err);

    return NextResponse.json(
      {
        error: 'There was an error updating the table',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}