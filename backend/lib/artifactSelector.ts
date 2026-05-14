import { db } from '@/lib/db';
import { metCountryToIso3 } from '@/lib/metCountryMap';
import { getDistribution, weightedRandom, PERIOD_RANGES } from '@/lib/distributionCache';

export interface SelectedArtifact {
  objectId: bigint;
  iso3: string;
  beginYear: number;
  endYear: number;
  imageUrl: string;
  title: string | null;
  linkResource: string | null;
}

/**
 * Picks a random eligible MetObject using the two-stage weighted draw:
 *   1. Randomly select a time period proportional to its share of the dataset.
 *   2. Randomly select a country within that period, again proportional to count.
 *   3. Fetch one artifact matching that period + country at a random offset.
 *
 * Reuses the cached distribution from getDistribution() so only one DB query
 * is issued per call on a warm cache.
 */
export async function pickRandomArtifact(maxAttempts = 10): Promise<SelectedArtifact | null> {
  const dist = await getDistribution();

  if (dist.periods.length === 0) return null;

  for (let i = 0; i < maxAttempts; i++) {
    const { period }         = weightedRandom(dist.periods);
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
        Link_Resource:     true,
      },
      orderBy: { Object_ID: 'asc' },
      skip:    Math.floor(Math.random() * count),
    });

    if (!artifact) continue;

    const iso3 = metCountryToIso3(artifact.Modern_Country!);
    if (!iso3) continue;

    const beginYear = Number(artifact.Object_Begin_Date);
    const endYear   = artifact.Object_End_Date != null
      ? Math.max(Number(artifact.Object_End_Date), beginYear)
      : beginYear;

    return {
      objectId:     artifact.Object_ID,
      iso3,
      beginYear,
      endYear,
      imageUrl:     artifact.Primary_Image_URL!,
      title:        artifact.Title ?? null,
      linkResource: artifact.Link_Resource ?? null,
    };
  }

  return null;
}
