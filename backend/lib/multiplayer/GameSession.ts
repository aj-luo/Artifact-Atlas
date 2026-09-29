import { rankPlayers } from './placements';
import { db } from '@/lib/db';
import { pickRandomArtifact, type SelectedArtifact } from '@/lib/artifactSelector';
import { ScoringModule, type ScoreResult } from './scoring';
import { Prisma, type multiplayer_games, type multiplayer_players, type multiplayer_guesses } from '@prisma/client';

export const MAX_PLAYERS = 20;

export interface PlayerStatus {
  id: string;
  memberId: string | null;
  finalPlacement: number | null;
  cumulativeScore: number;
  eliminationRound: number | null;
  name: string;
  health: number;
  isEliminated: boolean;
  hasGuessedThisRound: boolean;
}

export interface RoundGuessResult {
  playerId: string;
  playerName: string;
  countryGuessed: string | null;
  yearGuessed: number | null;
  distanceKm: number | null;
  yearsAway: number | null;
  totalScore: number;
  hpLost: number;
  isEliminated: boolean;
}

export interface LastRoundReveal {
  round: number;
  artifactIso3: string;
  artifactBeginYear: number;
  artifactEndYear: number;
  artifactTitle: string | null;
  artifactImageUrl: string | null;
  artifactObjectId: string | null;
  guesses: RoundGuessResult[];
}

export interface GameStatusResponse {
  gameId: string;
  revision: number;
  serverTime: string;
  status: 'waiting' | 'active' | 'finished';
  currentRound: number;
  maxRounds: number;
  maxHealth: number;
  countdownSeconds: number;
  hostId: string | null;
  currentArtifact: { imageUrl: string } | null;
  roundStartsAt: string | null;
  roundEndsAt: string | null;
  resultsRevealAt: string | null;
  awaitingHost: boolean;
  players: PlayerStatus[];
  lastRoundReveal: LastRoundReveal | null;
  roundHistory: LastRoundReveal[];
}

export interface GuessResult {
  score: ScoreResult;
  roundResolved: boolean;
}

export interface FastGuessResult {
  result: GuessResult;
  timing: { scoringMs: number; transactionMs: number };
}

export class GameSessionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly stateChanged: boolean = false,
  ) {
    super(message);
    this.name = 'GameSessionError';
  }
}

type Transaction = Prisma.TransactionClient;

type ResolutionTiming = {
  selectionMs: number;
  lockWaitMs: number;
  readsMs: number;
  missingGuessesMs: number;
  playerUpdatesMs: number;
  placementMs: number;
  finalGameUpdateMs: number;
};

function resolutionTiming(): ResolutionTiming {
  return { selectionMs: 0, lockWaitMs: 0, readsMs: 0, missingGuessesMs: 0,
    playerUpdatesMs: 0, placementMs: 0, finalGameUpdateMs: 0 };
}

function reportResolution(timing: ResolutionTiming, started: number, resolved: boolean) {
  const tenth = (ms: number) => Math.round(ms * 10) / 10;
  console.info('[multiplayer/resolve:timing]', JSON.stringify({
    ...Object.fromEntries(Object.entries(timing).map(([key, value]) => [key, tenth(value)])),
    totalMs: tenth(performance.now() - started), resolved,
  }));
}

//lock the game row for update to prevent race conditions when multiple players are joining the same game at the same time. This is used in the join method to ensure that the player count is accurate and that the game is still in waiting state before allowing a new player to join.
async function lockGame(tx: Transaction, gameId: string): Promise<multiplayer_games | null> {
  // Global lock order: room before session, shared with room transitions.
  await tx.$queryRaw`SELECT id FROM multiplayer_rooms WHERE id =
    (SELECT room_id FROM multiplayer_games WHERE id = ${gameId}::uuid) FOR UPDATE`;
  const rows = await tx.$queryRaw<multiplayer_games[]>`
    SELECT * FROM "multiplayer_games" WHERE "id" = ${gameId}::uuid FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function databaseNow(tx: Transaction): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return rows[0].now;
}


function roundDuration(seconds: number): number {
  return Math.min(120, Math.max(30, seconds));
}

async function initializeRoundWindow(tx: Transaction, game: multiplayer_games, now: Date): Promise<multiplayer_games> {
  if (game.status !== 'active' || game.awaiting_host || game.round_ends_at) return game;
  const startsAt = new Date(Math.max(now.getTime(), game.round_starts_at?.getTime() ?? 0));
  return tx.multiplayer_games.update({
    where: { id: game.id },
    data: {
      countdown_seconds: roundDuration(game.countdown_seconds),
      round_starts_at: startsAt,
      round_ends_at: new Date(startsAt.getTime() + roundDuration(game.countdown_seconds) * 1000),
      revision: { increment: 1 },
    },
  });
}

export class GameSession {
  private constructor(
    private game: multiplayer_games,
    private players: multiplayer_players[],
    private roundGuesses: multiplayer_guesses[],
    private serverTime: Date,
  ) {}

  static async load(gameId: string, client: Transaction = db): Promise<GameSession | null> {
    const game = await client.multiplayer_games.findUnique({ where: { id: gameId } });
    if (!game) return null;

    const [players, roundGuesses] = await Promise.all([
      client.multiplayer_players.findMany({ where: { game_id: gameId } }),
      client.multiplayer_guesses.findMany({
        where: { game_id: gameId, round_number: game.current_round },
      }),
    ]);
    return new GameSession(game, players, roundGuesses, await databaseNow(client));
  }

  private async refresh(): Promise<void> {
    const updated = await GameSession.load(this.game.id);
    if (!updated) throw new GameSessionError('Game not found', 404);
    this.game = updated.game;
    this.players = updated.players;
    this.roundGuesses = updated.roundGuesses;
    this.serverTime = updated.serverTime;
  }

  static async submitAuthorizedGuess(
    context: { roomId: string; memberId: string; game: multiplayer_games },
    playerId: string, country: string, year: number, expectedRound: number,
  ): Promise<FastGuessResult> {
    const normalizedCountry = country.toUpperCase();
    const sourceGame = context.game;
    if (!sourceGame.artifact_iso3 || sourceGame.artifact_begin_year == null || sourceGame.artifact_end_year == null) {
      throw new GameSessionError('Game artifact is not set', 500);
    }
    const scoreStarted = performance.now();
    const score = await ScoringModule.calculateScore(normalizedCountry, sourceGame.artifact_iso3, year,
      sourceGame.artifact_begin_year, sourceGame.artifact_end_year);
    const scoringMs = performance.now() - scoreStarted;
    const transactionStarted = performance.now();
    const result = await db.$transaction(async (tx) => {
      const game = await lockGame(tx, sourceGame.id);
      if (!game) throw new GameSessionError('Game not found', 404);
      const member = await tx.multiplayer_room_members.findFirst({
        where: { id: context.memberId, room_id: context.roomId, left_at: null },
      });
      if (!member) throw new GameSessionError('Room membership is no longer active', 403);
      if (game.room_id !== context.roomId || game.current_round !== expectedRound || game.status !== 'active') {
        throw new GameSessionError('Session is no longer active or the round changed', 409);
      }
      if (game.current_round !== sourceGame.current_round || game.object_id !== sourceGame.object_id) {
        throw new GameSessionError('Round changed while the guess was being scored; please try again', 409);
      }
      if (game.awaiting_host) throw new GameSessionError('Waiting for the host to start the next round', 409);
      const now = await databaseNow(tx);
      const initialized = await initializeRoundWindow(tx, game, now);
      if (initialized.round_starts_at && now < initialized.round_starts_at) throw new GameSessionError('The next round has not started yet', 409);
      if (initialized.round_ends_at && now >= initialized.round_ends_at) throw new GameSessionError('Round has ended; this guess was not accepted', 409, true);
      const player = await tx.multiplayer_players.findFirst({ where: { id: playerId, game_id: game.id, member_id: context.memberId } });
      if (!player) throw new GameSessionError('Player does not belong to this member', 403);
      if (player.is_eliminated) throw new GameSessionError('Player is eliminated', 409);
      const alreadyGuessed = await tx.multiplayer_guesses.findUnique({
        where: { game_id_player_id_round_number: { game_id: game.id, player_id: playerId, round_number: game.current_round } },
      });
      if (alreadyGuessed) throw new GameSessionError('Already submitted a guess this round', 409);
      await tx.multiplayer_guesses.create({ data: {
        game_id: game.id, player_id: playerId, round_number: game.current_round,
        country_guessed: normalizedCountry, year_guessed: year,
        distance_km: score.distanceKm, years_away: score.yearsAway,
        score_country: score.countryScore, score_year: score.yearScore,
        total_score: score.totalScore, submitted_at: now,
      } });
      await tx.multiplayer_games.update({ where: { id: game.id }, data: { revision: { increment: 1 } } });
      return { score, roundResolved: false };
    });
    return { result, timing: { scoringMs, transactionMs: performance.now() - transactionStarted } };
  }

  async submitGuess(playerId: string, country: string, year: number, expectedRound: number, refresh = true): Promise<GuessResult> {
    if (!this.game.artifact_iso3 || this.game.artifact_begin_year == null || this.game.artifact_end_year == null) {
      throw new GameSessionError('Game artifact is not set', 500);
    }

    const normalizedCountry = country.toUpperCase();
    const activePlayerCount = this.players.filter((player) => !player.is_eliminated).length;
    const likelyToResolve = this.roundGuesses.length + 1 >= activePlayerCount;
    const resolveStarted = performance.now();
    const timing = resolutionTiming();
    // Artifact selection can require database work. Keep ordinary guesses on the
    // fast path and only prefetch when this guess is expected to end the round.
    const [score, nextArtifact] = await Promise.all([
      ScoringModule.calculateScore(normalizedCountry, this.game.artifact_iso3, year,
        this.game.artifact_begin_year, this.game.artifact_end_year),
      likelyToResolve && activePlayerCount > 1 && this.game.current_round < this.game.max_rounds
        ? (async () => {
          const started = performance.now();
          const artifact = await pickRandomArtifact();
          timing.selectionMs = performance.now() - started;
          return artifact;
        })() : Promise.resolve(null),
    ]);

    const result = await db.$transaction(async (tx) => {
      const lockStarted = performance.now();
      let game = await lockGame(tx, this.game.id);
      timing.lockWaitMs = performance.now() - lockStarted;
      if (!game) throw new GameSessionError('Game not found', 404);
      if (game.current_round !== expectedRound) throw new GameSessionError('Round changed', 409);
      if (game.status !== 'active') {
        throw new GameSessionError(`Game is not active (status: ${game.status})`, 409);
      }
      if (
        game.current_round !== this.game.current_round ||
        game.object_id !== this.game.object_id
      ) {
        throw new GameSessionError('Round changed while the guess was being scored; please try again', 409);
      }

      if (game.awaiting_host) throw new GameSessionError('Waiting for the host to start the next round', 409);
      const now = await databaseNow(tx);
      game = await initializeRoundWindow(tx, game, now);
      if (game.round_starts_at && now < game.round_starts_at) {
        throw new GameSessionError('The next round has not started yet', 409);
      }
      if (game.round_ends_at && now >= game.round_ends_at) {
        const resolved = await this.resolveLocked(tx, game, now, nextArtifact, timing);
        return { late: true as const, resolved };
      }

      const player = await tx.multiplayer_players.findFirst({
        where: { id: playerId, game_id: game.id },
      });
      if (!player) throw new GameSessionError('Player not found in this game', 404);
      if (player.is_eliminated) throw new GameSessionError('Player is eliminated', 409);

      const alreadyGuessed = await tx.multiplayer_guesses.findUnique({
        where: { game_id_player_id_round_number: {
          game_id: game.id, player_id: playerId, round_number: game.current_round,
        } },
      });
      if (alreadyGuessed) throw new GameSessionError('Already submitted a guess this round', 409);

      await tx.multiplayer_guesses.create({
        data: {
          game_id: game.id, player_id: playerId, round_number: game.current_round,
          country_guessed: normalizedCountry, year_guessed: year,
          distance_km: score.distanceKm, years_away: score.yearsAway,
          score_country: score.countryScore, score_year: score.yearScore,
          total_score: score.totalScore, submitted_at: now,
        },
      });
      const updatedGame = await tx.multiplayer_games.update({
        where: { id: game.id },
        data: {
          revision: { increment: 1 },
        },
      });
      const roundResolved = await this.resolveLocked(tx, updatedGame, now, nextArtifact, timing);
      return { late: false as const, score, roundResolved };
    });

    if (refresh) await this.refresh();
    if (timing.readsMs) reportResolution(timing, resolveStarted, result.late ? result.resolved : result.roundResolved);
    if (result.late) {
      throw new GameSessionError('Round has ended; this guess was not accepted', 409, result.resolved);
    }
    return { score: result.score, roundResolved: result.roundResolved };
  }

  async resolveRoundIfNeeded(): Promise<boolean> {
    if (this.game.status !== 'active' || this.game.awaiting_host) return false;
    const resolveStarted = performance.now();
    const timing = resolutionTiming();
    let initialized = false;
    if (!this.game.round_ends_at) {
      initialized = await db.$transaction(async (tx) => {
        const game = await lockGame(tx, this.game.id);
        if (!game || game.status !== 'active' || game.awaiting_host || game.round_ends_at) return false;
        await initializeRoundWindow(tx, game, await databaseNow(tx));
        return true;
      });
      await this.refresh();
    }
    const timerExpired = this.game.round_ends_at !== null && (await databaseNow(db)) >= this.game.round_ends_at;
    const allGuessed = this.players.filter((player) => !player.is_eliminated)
      .every((player) => this.roundGuesses.some((guess) => guess.player_id === player.id));
    if (!timerExpired && !allGuessed) return initialized;

    const needsArtifact = this.game.current_round < this.game.max_rounds
      && this.players.filter(player => !player.is_eliminated).length > 1;
    const selectionStarted = performance.now();
    const nextArtifact = needsArtifact ? await pickRandomArtifact() : null;
    timing.selectionMs = performance.now() - selectionStarted;
    const resolved = await db.$transaction(async (tx) => {
      const lockStarted = performance.now();
      const game = await lockGame(tx, this.game.id);
      timing.lockWaitMs = performance.now() - lockStarted;
      if (!game || game.status !== 'active') return false;
      return this.resolveLocked(tx, game, await databaseNow(tx), nextArtifact, timing);
    });
    if (resolved) await this.refresh();
    reportResolution(timing, resolveStarted, resolved);
    return resolved || initialized;
  }

  private async resolveLocked(
    tx: Transaction,
    game: multiplayer_games,
    now: Date,
    nextArtifact: SelectedArtifact | null,
    timing: ResolutionTiming,
  ): Promise<boolean> {
    if (game.status !== 'active' || game.awaiting_host || (game.round_starts_at && now < game.round_starts_at)) return false;
    const readsStarted = performance.now();
    const [guesses, players] = await Promise.all([
      tx.multiplayer_guesses.findMany({
        where: { game_id: game.id, round_number: game.current_round },
      }),
      tx.multiplayer_players.findMany({ where: { game_id: game.id } }),
    ]);
    timing.readsMs = performance.now() - readsStarted;
    const activePlayers = players.filter((player) => !player.is_eliminated);
    const timerExpired = game.round_ends_at !== null && now >= game.round_ends_at;
    const allGuessed = activePlayers.every((player) => guesses.some((guess) => guess.player_id === player.id));
    if (!timerExpired && !allGuessed) return false;

    // A concurrent guess can make a request that looked non-final become final
    // after it acquires the lock. Commit that guess promptly; the game-row
    // invalidation/status recovery will resolve it with a prefetched artifact.
    // Return before applying any damage so resolution stays all-or-nothing.
    const definitelyGameOver = activePlayers.length <= 1 || game.current_round >= game.max_rounds;
    if (!definitelyGameOver && !nextArtifact) return false;

    const maxScore = guesses.length ? Math.max(...guesses.map((guess) => guess.total_score)) : 0;
    const healthBeforeRound = Object.fromEntries(players.map((player) => [player.id, player.health]));
    const guessesByPlayer = new Map(guesses.map((guess) => [guess.player_id, guess]));
    const missingIds = activePlayers.filter((player) => !guessesByPlayer.has(player.id)).map((player) => player.id);
    const missingStarted = performance.now();
    const missingGuesses = missingIds.length ? await tx.$queryRaw<multiplayer_guesses[]>`
      INSERT INTO multiplayer_guesses (game_id, player_id, round_number, total_score, submitted_at)
      SELECT ${game.id}::uuid, id::uuid, ${game.current_round}, 0, ${now}
      FROM jsonb_array_elements_text(${JSON.stringify(missingIds)}::jsonb) AS missing(id)
      RETURNING *
    ` : [];
    timing.missingGuessesMs = performance.now() - missingStarted;
    for (const guess of missingGuesses) guessesByPlayer.set(guess.player_id, guess);

    const playerUpdates = activePlayers.map((player) => {
      const score = guessesByPlayer.get(player.id)?.total_score ?? 0;
      const health = Math.max(0, player.health - (maxScore - score));
      return { id: player.id, health, is_eliminated: health <= 0,
        elimination_round: health <= 0 ? game.current_round : null,
        cumulative_score: player.cumulative_score + score };
    });
    const updatesStarted = performance.now();
    const changedPlayers = playerUpdates.length ? await tx.$queryRaw<multiplayer_players[]>`
      UPDATE multiplayer_players AS p
      SET health = changes.health, is_eliminated = changes.is_eliminated,
          elimination_round = changes.elimination_round, cumulative_score = changes.cumulative_score
      FROM jsonb_to_recordset(${JSON.stringify(playerUpdates)}::jsonb) AS changes
        (id uuid, health integer, is_eliminated boolean, elimination_round integer, cumulative_score integer)
      WHERE p.id = changes.id AND p.game_id = ${game.id}::uuid
      RETURNING p.*
    ` : [];
    timing.playerUpdatesMs = performance.now() - updatesStarted;
    const changedById = new Map(changedPlayers.map((player) => [player.id, player]));
    const updatedPlayers = players.map((player) => changedById.get(player.id) ?? player);
    const playersById = Object.fromEntries(updatedPlayers.map((player) => [player.id, player]));
    const reveal: LastRoundReveal = {
      round: game.current_round,
      artifactIso3: game.artifact_iso3!,
      artifactBeginYear: game.artifact_begin_year!,
      artifactEndYear: game.artifact_end_year!,
      artifactTitle: game.artifact_title ?? null,
      artifactImageUrl: game.artifact_image_url ?? null,
      artifactObjectId: game.object_id?.toString() ?? null,
      guesses: updatedPlayers.map((player) => {
        const guess = guessesByPlayer.get(player.id);
        return {
          playerId: player.id,
          playerName: player.name,
          countryGuessed: guess?.country_guessed ?? null,
          yearGuessed: guess?.year_guessed ?? null,
          distanceKm: guess?.distance_km == null ? null : Math.round(guess.distance_km),
          yearsAway: guess?.years_away ?? null,
          totalScore: guess?.total_score ?? 0,
          hpLost: Math.max(0, (healthBeforeRound[player.id] ?? player.health) - player.health),
          isEliminated: playersById[player.id]?.is_eliminated ?? false,
        };
      }),
    };
    const remaining = updatedPlayers.filter((player) => !player.is_eliminated);
    const gameOver = remaining.length <= 1 || game.current_round >= game.max_rounds;

    const existingHistory = Array.isArray(game.round_history) ? game.round_history : [];
    const roundHistory = [...existingHistory, reveal].slice(-20) as Prisma.InputJsonValue;

    const revealAt = new Date((await databaseNow(tx)).getTime() + 1000);
    if (gameOver) {
      const placementStarted = performance.now();
      const unknownElimination = updatedPlayers.some(p => p.is_eliminated && p.elimination_round === null);
      const placements = rankPlayers(updatedPlayers).map(player => ({
        id: player.id, final_placement: unknownElimination ? null : player.final_placement,
      }));
      if (placements.length) await tx.$queryRaw`
        UPDATE multiplayer_players AS p
        SET final_placement = ranks.final_placement, completed_at = ${now}
        FROM jsonb_to_recordset(${JSON.stringify(placements)}::jsonb) AS ranks
          (id uuid, final_placement integer)
        WHERE p.id = ranks.id AND p.game_id = ${game.id}::uuid
        RETURNING p.id
      `;
      timing.placementMs = performance.now() - placementStarted;
      const gameUpdateStarted = performance.now();
      await tx.multiplayer_games.update({
        where: { id: game.id },
        data: {
          status: 'finished', completed_at: now,
          results_reveal_at: revealAt,
          last_round_reveal: reveal as unknown as Prisma.InputJsonValue,
          round_history: roundHistory,
          round_starts_at: null,
          revision: { increment: 1 },
        },
      });
      timing.finalGameUpdateMs = performance.now() - gameUpdateStarted;
    } else {
      const room = game.room_id ? await tx.multiplayer_rooms.findUnique({ where: { id: game.room_id } }) : null;
      const awaitingHost = room?.auto_advance_rounds === false;
      const gameUpdateStarted = performance.now();
      await tx.multiplayer_games.update({
        where: { id: game.id },
        data: {
          current_round: game.current_round + 1,
          awaiting_host: awaitingHost,
          results_reveal_at: revealAt,
          object_id: nextArtifact!.objectId, artifact_iso3: nextArtifact!.iso3,
          artifact_begin_year: nextArtifact!.beginYear, artifact_end_year: nextArtifact!.endYear,
          artifact_image_url: nextArtifact!.imageUrl, artifact_title: nextArtifact!.title,
          countdown_seconds: roundDuration(game.countdown_seconds),
          round_ends_at: awaitingHost ? null : new Date(revealAt.getTime() + 20_000 + roundDuration(game.countdown_seconds) * 1000),
          round_starts_at: awaitingHost ? null : new Date(revealAt.getTime() + 20_000),
          last_round_reveal: reveal as unknown as Prisma.InputJsonValue,
          round_history: roundHistory,
          revision: { increment: 2 },
        },
      });
      timing.finalGameUpdateMs = performance.now() - gameUpdateStarted;
    }
    return true;
  }

  getStatus(): GameStatusResponse {
    const guessedIds = new Set(this.roundGuesses.map((guess) => guess.player_id));
    const players = [...this.players].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    const lastRoundReveal = (this.game.last_round_reveal as unknown as LastRoundReveal | null) ?? null;
    const storedHistory = Array.isArray(this.game.round_history)
      ? this.game.round_history as unknown as LastRoundReveal[]
      : [];
    // Games created before round_history was introduced still expose their
    // available last result instead of appearing to have no completed rounds.
    const roundHistory = storedHistory.length > 0 ? storedHistory : (lastRoundReveal ? [lastRoundReveal] : []);
    return {
      gameId: this.game.id,
      revision: this.game.revision,
      serverTime: this.serverTime.toISOString(),
      status: this.game.status as GameStatusResponse['status'],
      currentRound: this.game.current_round,
      maxRounds: this.game.max_rounds,
      maxHealth: this.game.max_health,
      countdownSeconds: this.game.countdown_seconds,
      hostId: players[0]?.id ?? null,
      currentArtifact: this.game.artifact_image_url ? { imageUrl: this.game.artifact_image_url } : null,
      roundStartsAt: this.game.round_starts_at?.toISOString() ?? null,
      roundEndsAt: this.game.round_ends_at?.toISOString() ?? null,
      resultsRevealAt: this.game.results_reveal_at?.toISOString() ?? null,
      awaitingHost: this.game.awaiting_host,
      players: players.map((player) => ({
        id: player.id, memberId: player.member_id, name: player.name, health: player.health,
        finalPlacement: player.final_placement, cumulativeScore: player.cumulative_score,
        eliminationRound: player.elimination_round,
        isEliminated: player.is_eliminated,
        hasGuessedThisRound: guessedIds.has(player.id),
      })),
      lastRoundReveal,
      roundHistory,
    };
  }

  async broadcastState(): Promise<void> {
    try {
      if (this.game.room_id) {
        const { broadcastRoom } = await import('./Room');
        await broadcastRoom(this.game.room_id);
        return;
      }
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error('Supabase broadcast environment is not configured');
      const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
        body: JSON.stringify({ messages: [{
          topic: `game-${this.game.id}`,
          event: 'game_update', payload: this.getStatus(),
        }] }),
      });
      if (!response.ok) {
        throw new Error(`Supabase broadcast returned ${response.status}: ${await response.text()}`);
      }
    } catch (error) {
      console.error('[GameSession.broadcastState] failed:', error);
    }
  }
}
