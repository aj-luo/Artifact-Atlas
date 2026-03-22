import { db } from './db';
import { metCountryToIso3 } from './metCountryMap';

export type TimePeriod = 'ancient' | 'medieval' | 'early_modern' | 'modern';

/** Inclusive/exclusive date ranges (Object_Begin_Date is a BigInt year, negative = BC). */
export const PERIOD_RANGES: Record<TimePeriod, { gte?: bigint; lt?: bigint }> = {
  ancient:      {                  lt: 500n  },
  medieval:     { gte: 500n,       lt: 1500n },
  early_modern: { gte: 1500n,      lt: 1800n },
  modern:       { gte: 1800n                 },
};

export type CountryEntry = { country: string; count: number };
export type PeriodEntry  = { period: TimePeriod; count: number };

export type Distribution = {
  periods:  PeriodEntry[];
  byPeriod: Record<TimePeriod, CountryEntry[]>;
};

// Survives Next.js hot-reloads in dev via globalThis
const g = globalThis as unknown as { _artifactDist?: Distribution };
const bannedIso3 = new Set(['BRN', 'GUY', 'VCT', 'VAT']);
/**
 * Returns (and lazily builds) a cached distribution of eligible artifacts
 * bucketed by time period and country.
 *
 * Only countries with a valid ISO-3 mapping are included, so the caller
 * never needs to retry because of an unmappable country name.
 */
export async function getDistribution(): Promise<Distribution> {
  if (g._artifactDist) return g._artifactDist;

  const periods: PeriodEntry[]                        = [];
  const byPeriod = {} as Record<TimePeriod, CountryEntry[]>;


  for (const [period, range] of Object.entries(PERIOD_RANGES) as [TimePeriod, { gte?: bigint; lt?: bigint }][]) {
    const rows = await db.metObjects.groupBy({
      by: ['Modern_Country'],
      where: {
        Primary_Image_URL: { not: null },
        Modern_Country:    { not: null },
        Object_Begin_Date: { not: null, ...range },
      },
      _count: { Object_ID: true },
    });

    type Row = (typeof rows)[number];
    
    const countries: CountryEntry[] = rows
      .filter((r: Row) => {
        if (!r.Modern_Country) return false;
        const iso3 = metCountryToIso3(r.Modern_Country);
        return iso3 !== null && !bannedIso3.has(iso3);
      })
      .map((r: Row) => ({ country: r.Modern_Country!, count: r._count.Object_ID }));

    const total = countries.reduce((s, c) => s + c.count, 0);
    if (total > 0) {
      periods.push({ period, count: total });
      byPeriod[period] = countries;
    }
  }

  const dist: Distribution = { periods, byPeriod };
  g._artifactDist = dist;
  return dist;
}

/** Picks a random item weighted by each entry's `count`. */
export function weightedRandom<T extends { count: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.count, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.count;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}
