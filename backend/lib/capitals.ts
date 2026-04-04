import { unstable_cache } from 'next/cache';
import { db } from './db';
import staticData from './staticCapitals.json';

export type Capital = { name: string; lat: number; lng: number };

async function buildCapitals(): Promise<Record<string, Capital>> {
  // Start with the static curated baseline so every country has a fallback
  const map: Record<string, Capital> = {};
  for (const [iso3, cap] of Object.entries(staticData as Record<string, Capital>)) {
    map[iso3.toUpperCase()] = cap;
  }

  try {
    // Single query: DISTINCT ON iso3 picks cap=1 first, falls back to maincity=1.
    // Replaces two sequential Supabase client queries.
    type Row = { iso3: string; city_en: string; lat: number; lon: number };
    const rows = await db.$queryRaw<Row[]>`
      SELECT DISTINCT ON (iso3) iso3, city_en, lat, lon
      FROM country_city_locations
      WHERE (cap = 1 OR maincity = 1)
        AND lat IS NOT NULL
        AND lon IS NOT NULL
      ORDER BY iso3, cap DESC NULLS LAST
    `;

    for (const row of rows) {
      if (row.iso3) {
        map[row.iso3.toUpperCase()] = { name: row.city_en, lat: row.lat, lng: row.lon };
      }
    }
  } catch (e) {
    console.warn('[capitals] DB fetch failed, using static data only:', e);
  }

  return map;
}

/**
 * Returns a Record<iso3, Capital> map of capital city coordinates.
 *
 * Backed by Next.js Data Cache (disk-persisted in production). Built once
 * from a single consolidated Prisma $queryRaw. Revalidates every 30 days.
 */
export const getCapitals = unstable_cache(
  buildCapitals,
  ['capitals'],
  { revalidate: 2592000, tags: ['capitals'] },
);
