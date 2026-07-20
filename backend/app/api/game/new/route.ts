import { NextResponse } from 'next/server';
import { pickRandomArtifact } from '@/lib/artifactSelector';
import { setGame, MAX_GUESSES } from '@/lib/gameStore';

/**
 * POST /api/game/new
 *
 * Picks a random eligible MetObject using a two-stage weighted draw:
 *   1. Randomly select a time period proportional to its share of the dataset.
 *   2. Randomly select a country within that period, again proportional to count.
 *   3. Fetch one artifact matching that period + country at a random offset.
 *
 * Country/period distributions are cached via Next.js Data Cache, so this
 * route only ever issues a single DB query per request on warm cache.
 *
 * Response: { gameId, imageUrl }
 */
export async function POST() {
  let artifact;
  try {
    artifact = await pickRandomArtifact();
  } catch (err) {
    console.error('[game/new] Failed to pick artifact:', err);
    return NextResponse.json({ error: 'Service unavailable — could not load artifact distribution' }, { status: 503 });
  }

  if (!artifact) {
    return NextResponse.json({ error: 'Could not find an artifact — try again' }, { status: 500 });
  }

  const gameId = crypto.randomUUID();

  try {
    await setGame({
      gameId,
      objectId:          artifact.objectId,
      artifactIso3:      artifact.iso3,
      artifactBeginYear: artifact.beginYear,
      artifactEndYear:   artifact.endYear,
      imageUrl:          artifact.imageUrl,
      title:             artifact.title,
      linkResource:      artifact.linkResource,
      guesses:           [],
      status:            'active',
      guessesLeft:       MAX_GUESSES,
    });
  } catch (err) {
    console.error('[game/new] Failed to persist game state:', err);
    return NextResponse.json({ error: 'Failed to create game' }, { status: 503 });
  }

  return NextResponse.json(
    { gameId, imageUrl: artifact.imageUrl },
    { status: 201 },
  );
}
