import { createClient } from '@supabase/supabase-js';

export type Capital = { name: string; lat: number; lng: number };

// Module-level cache — avoids re-fetching on every request
let capitalsCache: Map<string, Capital> | null = null;

/**
 * Returns a Map<iso3, Capital> loaded from the `country_city_locations` table.
 *
 * Filters to maincity = 1 (national capital) and deduplicates by iso3
 * (first occurrence wins) in case the table ever gains duplicate entries.
 */
export async function getCapitals(): Promise<Map<string, Capital>> {
  if (capitalsCache) return capitalsCache;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / key env vars are not set');

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from('country_city_locations')
    .select('iso3, city_en, lat, lon')
    .eq('maincity', 1);

  if (error) throw new Error(`Failed to load capitals: ${error.message}`);

  type Row = { iso3: string; city_en: string; lat: number; lon: number };

  const map = new Map<string, Capital>();
  for (const row of (data ?? []) as Row[]) {
    if (row.iso3 && !map.has(row.iso3)) {
      // DB column is `lon`; we store as `lng` for consistency with geo helpers
      map.set(row.iso3.toUpperCase(), {
        name: row.city_en,
        lat:  row.lat,
        lng:  row.lon,
      });
    }
  }

  capitalsCache = map;
  return capitalsCache;
}
