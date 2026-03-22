export const MAX_GUESSES = 5;

export type GuessRecord = {
  guessNumber:  number;
  country:      string;
  year:         number;
  bearing:      number;
  cardinal:     string;
  distanceKm:   number;
  geoDisplay:   string;
  yearHint:     string;
  correct:      boolean;
};

export type GameState = {
  gameId:           string;
  objectId:         bigint;
  artifactIso3:     string;
  artifactBeginYear: number;  // negative = BC
  artifactEndYear:   number;  // negative = BC
  imageUrl:         string;
  title:            string | null;
  guesses:          GuessRecord[];
  status:           'active' | 'won' | 'lost' | 'forfeited';
  guessesLeft:      number;
};

export type PairResult = { distKm: number; bear: number };

// Survives Next.js hot-reloads in dev via globalThis
const g = globalThis as unknown as {
  _gameStore:  Map<string, GameState>;
  _pairCache:  Map<string, PairResult>;
};
if (!g._gameStore) g._gameStore = new Map();
if (!g._pairCache) g._pairCache = new Map();

export const gameStore:  Map<string, GameState>  = g._gameStore;
export const pairCache:  Map<string, PairResult>  = g._pairCache;
