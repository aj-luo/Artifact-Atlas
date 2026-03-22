import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { metCountryToIso3 } from '@/lib/metCountryMap';
import { gameStore, MAX_GUESSES } from '@/lib/gameStore';
import { getDistribution, weightedRandom, PERIOD_RANGES } from '@/lib/distributionCache';

/**
 * POST /api/game/new
 *
 * Picks a random eligible MetObject using a two-stage weighted draw:
 *   1. Randomly select a time period proportional to its share of the dataset.
 *   2. Randomly select a country within that period, again proportional to count.
 *   3. Fetch one artifact matching that period + country at a random offset.
 *
 * Country/period distributions are computed once and cached for the process
 * lifetime, so this route only ever issues a single DB query per request.
 *
 * Response: { gameId, imageUrl, title }
 */
export async function POST() {
  const dist = await getDistribution();

  if (dist.periods.length === 0) {
    return NextResponse.json({ error: 'No eligible artifacts found' }, { status: 404 });
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    // Stage 1: pick a time period weighted by artifact count
    const { period }         = weightedRandom(dist.periods);
    // Stage 2: pick a country within that period, again weighted by count
    const { country, count } = weightedRandom(dist.byPeriod[period]);

    const range = PERIOD_RANGES[period];

    const artifact = await db.metObjects.findFirst({
      where: {
        Primary_Image_URL: { not: null },
        Modern_Country:    country,
        Object_Begin_Date: { not: null, ...range },
      },
      select: {
        Object_ID:         true,
        Primary_Image_URL: true,
        Modern_Country:    true,
        Object_Begin_Date: true,
        Object_End_Date:   true,
        Title:             true,
      },
      skip: Math.floor(Math.random() * count),
    });

    if (!artifact) continue;

    const artifactIso3 = metCountryToIso3(artifact.Modern_Country!);
    if (!artifactIso3) continue; // distribution filters these out, but guard remains

    const gameId    = crypto.randomUUID();
    const beginYear = Number(artifact.Object_Begin_Date);
    const endYear   = artifact.Object_End_Date
      ? Math.max(Number(artifact.Object_End_Date), beginYear)
      : beginYear;

    gameStore.set(gameId, {
      gameId,
      objectId:          artifact.Object_ID,
      artifactIso3,
      artifactBeginYear: beginYear,
      artifactEndYear:   endYear,
      imageUrl:          artifact.Primary_Image_URL!,
      title:             artifact.Title ?? null,
      guesses:           [],
      status:            'active',
      guessesLeft:       MAX_GUESSES,
    });

    return NextResponse.json(
      { 
        gameId, imageUrl: 
        artifact.Primary_Image_URL, 
        // title: artifact.Title 
      },
      { status: 201 },
    );
  }

  return NextResponse.json(
    { error: 'Could not find an artifact — try again' },
    { status: 500 },
  );
}
