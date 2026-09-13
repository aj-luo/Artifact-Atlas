export type PlacementPlayer = {
  id: string; is_eliminated: boolean; elimination_round: number | null;
  health: number; cumulative_score: number;
};

export function rankPlayers<T extends PlacementPlayer>(players: T[]) {
  const compare = (a: T, b: T) => Number(a.is_eliminated) - Number(b.is_eliminated)
    || (a.is_eliminated ? (b.elimination_round ?? 0) - (a.elimination_round ?? 0) : 0)
    || b.health - a.health || b.cumulative_score - a.cumulative_score;
  const sorted = [...players].sort(compare);
  let place = 1;
  return sorted.map((player, index) => {
    if (index > 0 && compare(sorted[index - 1], player) !== 0) place = index + 1;
    return { ...player, final_placement: place };
  });
}
