import data from './metCountryMap.json';

const MAP = data as Record<string, string>;

/**
 * Returns the ISO 3166-1 alpha-3 code for a MetObjects `Modern_Country` value.
 * Handles pipe-separated multi-country strings by taking the first entry.
 * Returns null if the country name is not recognised.
 */
export function metCountryToIso3(modernCountry: string): string | null {
  const first = modernCountry.split('|')[0].trim();
  return MAP[first] ?? null;
}
