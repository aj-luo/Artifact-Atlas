import { getGeoForPair } from '@/lib/geoCache';

export interface ScoreResult {
  distanceKm:   number;
  yearsAway:    number;
  countryScore: number;
  yearScore:    number;
  totalScore:   number;
}

/**
 * Scoring for multiplayer rounds.
 *
 * Geography (max 2500 pts): -1 pt per km. Zero pts at >= 2500 km.
 * Year      (max 2500 pts): -25 pts per year outside [beginYear, endYear]. Zero at >= 100 years.
 *
 * Max possible score: 5000 (exact country + year within artifact's date range).
 */
export class ScoringModule {
  static readonly MAX_COUNTRY_SCORE = 2500;
  static readonly MAX_YEAR_SCORE    = 2500;
  static readonly KM_PER_POINT      = 1;    // -1 pt per km
  static readonly YR_PER_POINT      = 25;   // -25 pts per year away

  static async calculateScore(
    guessedIso3: string,
    artifactIso3: string,
    guessedYear: number,
    artifactBeginYear: number,
    artifactEndYear: number,
  ): Promise<ScoreResult> {
    // Geographic score
    let distanceKm = 0;
    if (guessedIso3 !== artifactIso3) {
      const geo = await getGeoForPair(guessedIso3, artifactIso3);
      distanceKm = geo.distKm;
    }
    const countryScore = Math.max(0, this.MAX_COUNTRY_SCORE - Math.round(distanceKm));

    // Year score — no penalty if guess falls within [beginYear, endYear]
    let yearsAway = 0;
    if (guessedYear < artifactBeginYear)    yearsAway = artifactBeginYear - guessedYear;
    else if (guessedYear > artifactEndYear) yearsAway = guessedYear - artifactEndYear;
    const yearScore = Math.max(0, this.MAX_YEAR_SCORE - (this.YR_PER_POINT * yearsAway));

    return {
      distanceKm:   Math.round(distanceKm),
      yearsAway,
      countryScore,
      yearScore,
      totalScore:   countryScore + yearScore,
    };
  }
}
