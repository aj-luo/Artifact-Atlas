export const MAX_GUESSES = 5;

export type GuessRecord = {
  guessNumber:  number;
  country:      string;
  year:         number;
  bearing:      number;
  distanceKm:   number;
  geoDisplay:   string;
  yearHint:     string;
  correct:      boolean;
};

export type GameState = {
  gameId:       string;
  objectId:     bigint;
  artifactIso3: string;
  artifactYear: number;
  imageUrl:     string;
  title:        string | null;
  guesses:      GuessRecord[];
  status:       'active' | 'won' | 'lost' | 'forfeited';
  guessesLeft:  number;
};

// Survives Next.js hot-reloads in dev via globalThis
const g = globalThis as unknown as { _gameStore: Map<string, GameState> };
if (!g._gameStore) g._gameStore = new Map();
export const gameStore: Map<string, GameState> = g._gameStore;
