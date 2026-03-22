const toRad = (d: number) => (d * Math.PI) / 180;

/**
 * Forward azimuth (bearing) from point A → point B, in degrees [0, 360).
 */
export function bearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/**
 * Great-circle distance between two points, in kilometres (Haversine formula).
 */
export function distanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * "Older" | "Younger" | "Correct"
 *
 * Framed from the artifact's perspective:
 *   artifact.yearMade > guessedYear  →  artifact is more recent  →  "Younger"
 *   artifact.yearMade < guessedYear  →  artifact is older        →  "Older"
 *   equal                            →  "Correct"
 */
export function yearHint(artifactYear: number, guessedYear: number): string {
  if (artifactYear === guessedYear) return "Correct";
  return artifactYear > guessedYear ? "Younger" : "Older";
}
