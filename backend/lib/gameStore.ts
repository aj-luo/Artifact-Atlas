import { db } from './db';

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
  gameId:            string;
  objectId:          bigint;
  artifactIso3:      string;
  artifactBeginYear: number; // negative = BC
  artifactEndYear:   number; // negative = BC
  imageUrl:          string;
  title:             string | null;
  linkResource:      string | null;
  guesses:           GuessRecord[];
  status:            'active' | 'won' | 'lost' | 'forfeited';
  guessesLeft:       number;
};

/** Retrieve a game from the database by gameId. Returns null if not found. */
export async function getGame(gameId: string): Promise<GameState | null> {
  const row = await db.active_games.findUnique({ where: { game_id: gameId } });
  if (!row) return null;
  return {
    gameId:            row.game_id,
    objectId:          row.object_id,
    artifactIso3:      row.artifact_iso3,
    artifactBeginYear: row.artifact_begin_year,
    artifactEndYear:   row.artifact_end_year,
    imageUrl:          row.image_url,
    title:             row.title,
    linkResource:      row.link_resource,
    guesses:           row.guesses as GuessRecord[],
    status:            row.status as GameState['status'],
    guessesLeft:       row.guesses_left,
  };
}

/** Persist (create or update) a game state in the database. */
export async function setGame(state: GameState): Promise<void> {
  const data = {
    object_id:           state.objectId,
    artifact_iso3:       state.artifactIso3,
    artifact_begin_year: state.artifactBeginYear,
    artifact_end_year:   state.artifactEndYear,
    image_url:           state.imageUrl,
    title:               state.title,
    link_resource:       state.linkResource,
    guesses:             state.guesses,
    status:              state.status,
    guesses_left:        state.guessesLeft,
  };
  await db.active_games.upsert({
    where:  { game_id: state.gameId },
    create: { game_id: state.gameId, ...data },
    update: data,
  });
}
