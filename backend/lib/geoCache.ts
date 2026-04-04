import { unstable_cache } from 'next/cache';
import { db } from './db';
import { getCapitals } from './capitals';
import { bearing, distanceKm } from './geo';

export type PairResult = { distKm: number; bear: number };

async function computeGeoForPair(guessedIso3: string, artifactIso3: string): Promise<PairResult> {
  const [entry, capitals] = await Promise.all([
    db.distMatrix.findUnique({
      where:  { iso_o_iso_d: { iso_o: guessedIso3, iso_d: artifactIso3 } },
      select: { distcap: true },
    }),
    getCapitals(),
  ]);

  const from = capitals[guessedIso3];
  const to   = capitals[artifactIso3];

  let distKm = 0;
  let bear   = 0;

  if (entry?.distcap != null) {
    distKm = entry.distcap;
    if (from && to) bear = bearing(from.lat, from.lng, to.lat, to.lng);
  } else if (from && to) {
    distKm = distanceKm(from.lat, from.lng, to.lat, to.lng);
    bear   = bearing(from.lat, from.lng, to.lat, to.lng);
  } else {
    console.warn(`[geo] lookups failed for ${guessedIso3}->${artifactIso3}, defaulting to 0`);
  }

  return { distKm, bear };
}

/**
 * Returns the great-circle distance (km) and bearing (°) between two countries'
 * capitals, identified by ISO alpha-3 codes.
 *
 * Results are backed by the Next.js Data Cache (disk-persisted in production)
 * and never time-expire — geographic distances don't change. Use
 * revalidateTag('geo-pairs') if data ever needs refreshing.
 */
export const getGeoForPair = unstable_cache(
  computeGeoForPair,
  ['geo-pair'],
  { revalidate: false, tags: ['geo-pairs'] },
);
