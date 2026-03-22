import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { metCountryToIso3 } from '@/lib/metCountryMap';
import { gameStore, MAX_GUESSES } from '@/lib/gameStore';

/**
 * POST /api/game/new
 *
 * Picks a random eligible MetObject, stores game state in memory,
 * and returns the game handle. No objectId is needed in subsequent requests.
 *
 * Response: { gameId, imageUrl, title }
 */
export async function POST() {
  const count = await db.metObjects.count({
    where: {
      Primary_Image_URL: { not: null },
      Modern_Country:    { not: null },
      Object_Begin_Date: { not: null },
    },
  });

  if (count === 0) {
    return NextResponse.json({ error: 'No eligible artifacts found' }, { status: 404 });
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const artifact = await db.metObjects.findFirst({
      where: {
        Primary_Image_URL: { not: null },
        Modern_Country:    { not: null },
        Object_Begin_Date: { not: null },
      },
      select: {
        Object_ID:         true,
        Primary_Image_URL: true,
        Modern_Country:    true,
        Object_Begin_Date: true,
        Title:             true,
      },
      skip: Math.floor(Math.random() * count),
    });

    if (!artifact) continue;

    const artifactIso3 = metCountryToIso3(artifact.Modern_Country!);
    if (!artifactIso3) continue;

    const gameId = crypto.randomUUID();

    gameStore.set(gameId, {
      gameId,
      objectId:     artifact.Object_ID,
      artifactIso3,
      artifactYear: Number(artifact.Object_Begin_Date),
      imageUrl:     artifact.Primary_Image_URL!,
      title:        artifact.Title ?? null,
      guesses:      [],
      status:       'active',
      guessesLeft:  MAX_GUESSES,
    });

    return NextResponse.json(
      { gameId, imageUrl: artifact.Primary_Image_URL, title: artifact.Title },
      { status: 201 },
    );
  }

  return NextResponse.json(
    { error: 'Could not find an artifact with a mappable country — try again' },
    { status: 500 },
  );
}
