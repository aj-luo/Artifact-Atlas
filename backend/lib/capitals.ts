import { createClient } from '@supabase/supabase-js';
import staticData from './staticCapitals.json';

export type Capital = { name: string; lat: number; lng: number };

// Module-level cache — avoids re-fetching on every request
let capitalsCache: Map<string, Capital> | null = null;

const STATIC_CAPITALS = staticData as Record<string, Capital>;

/**
 * Returns a Map<iso3, Capital>.
 *
 * Loads from DB using cap=1 (national capital flag), falling back to
 * maincity=1 for any country still missing, then fills remaining gaps
 * from the static curated dataset.
 */
export async function getCapitals(): Promise<Map<string, Capital>> {
  if (capitalsCache) return capitalsCache;

  // Start with static data so every country has a baseline
  const map = new Map<string, Capital>(
    Object.entries(STATIC_CAPITALS).map(([iso3, cap]) => [iso3.toUpperCase(), cap])
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key) {
    try {
      const supabase = createClient(url, key);
      type Row = { iso3: string; city_en: string; lat: number; lon: number };

      // Primary: cap = 1
      const { data: capData, error: capErr } = await supabase
        .from('country_city_locations')
        .select('iso3, city_en, lat, lon')
        .eq('cap', 1);

      if (!capErr) {
        for (const row of (capData ?? []) as Row[]) {
          if (row.iso3) {
            map.set(row.iso3.toUpperCase(), { name: row.city_en, lat: row.lat, lng: row.lon });
          }
        }
      } else {
        console.warn(`[capitals] cap=1 query failed: ${capErr.message}`);
      }

      // Secondary: maincity = 1 — fills in any iso3 still missing after cap=1
      const missing = [...map.keys()].filter(
        (iso3) => !capData?.some((r: Row) => r.iso3?.toUpperCase() === iso3)
      );
      if (missing.length > 0) {
        const { data: mainData, error: mainErr } = await supabase
          .from('country_city_locations')
          .select('iso3, city_en, lat, lon')
          .eq('maincity', 1)
          .in('iso3', missing);

        if (!mainErr) {
          for (const row of (mainData ?? []) as Row[]) {
            if (row.iso3 && !map.has(row.iso3.toUpperCase())) {
              map.set(row.iso3.toUpperCase(), { name: row.city_en, lat: row.lat, lng: row.lon });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[capitals] DB fetch threw, using static data only:', e);
    }
  }

  capitalsCache = map;
  return capitalsCache;
}
