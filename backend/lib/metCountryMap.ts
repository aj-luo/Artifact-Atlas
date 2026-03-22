/**
 * Maps the `Modern Country` strings found in MetObjects to ISO 3166-1 alpha-3 codes.
 * Multi-country values (e.g. "France|Germany") are split by the caller; this map
 * covers the individual country names observed in the dataset.
 */
export const MET_COUNTRY_TO_ISO3: Record<string, string> = {
  'Austria':                  'AUT',
  'Azerbaijan':               'AZE',
  'Belgium':                  'BEL',
  'Bosnia and Herzegovina':   'BIH',
  'Bulgaria':                 'BGR',
  'Czech Republic':           'CZE',
  'Denmark':                  'DNK',
  'Egypt':                    'EGY',
  'France':                   'FRA',
  'Germany':                  'DEU',
  'Greece':                   'GRC',
  'Hungary':                  'HUN',
  'Italy':                    'ITA',
  'Lebanon':                  'LBN',
  'Netherlands':              'NLD',
  'North Macedonia':          'MKD',
  'Norway':                   'NOR',
  'Portugal':                 'PRT',
  'Romania':                  'ROU',
  'Russia':                   'RUS',
  'Serbia':                   'SRB',
  'Slovakia':                 'SVK',
  'Spain':                    'ESP',
  'Sudan':                    'SDN',
  'Sweden':                   'SWE',
  'Switzerland':              'CHE',
  'Syria':                    'SYR',
  'Turkey':                   'TUR',
  'Ukraine':                  'UKR',
  'United Kingdom':           'GBR',
  'United States':            'USA',
};

/**
 * Returns the iso3 code for a MetObjects `Modern Country` value.
 * Handles pipe-separated multi-country strings by taking the first entry.
 */
export function metCountryToIso3(modernCountry: string): string | null {
  const first = modernCountry.split('|')[0].trim();
  return MET_COUNTRY_TO_ISO3[first] ?? null;
}
