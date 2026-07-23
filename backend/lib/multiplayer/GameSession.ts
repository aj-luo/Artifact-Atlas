import { db } from '@/lib/db';
import { pickRandomArtifact, type SelectedArtifact } from '@/lib/artifactSelector';
import { ScoringModule, type ScoreResult } from './scoring';
import { Prisma, type multiplayer_games, type multiplayer_players, type multiplayer_guesses } from '@prisma/client';

export const MAX_PLAYERS = 20;

export interface PlayerStatus {
  id: string;
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
  players: PlayerStatus[];
  lastRoundReveal: LastRoundReveal | null;
  roundHistory: LastRoundReveal[];
}

export interface GuessResult {
  score: ScoreResult;
  roundResolved: boolean;
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

async function lockGame(tx: Transaction, gameId: string): Promise<multiplayer_games | null> {
  const rows = await tx.$queryRaw<multiplayer_games[]>`
    SELECT * FROM "multiplayer_games" WHERE "id" = ${gameId}::uuid FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function databaseNow(tx: Transaction): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return rows[0].now;
}

export class GameSession {
  private constructor(
    private game: multiplayer_games,
    private players: multiplayer_players[],
    private roundGuesses: multiplayer_guesses[],
  ) {}

  static async load(gameId: string): Promise<GameSession | null> {
    const game = await db.multiplayer_games.findUnique({ where: { id: gameId } });
    if (!game) return null;

    const [players, roundGuesses] = await Promise.all([
      db.multiplayer_players.findMany({ where: { game_id: gameId } }),
      db.multiplayer_guesses.findMany({
        where: { game_id: gameId, round_number: game.current_round },
      }),
    ]);
    return new GameSession(game, players, roundGuesses);
  }

  private async refresh(): Promise<void> {
    const updated = await GameSession.load(this.game.id);
    if (!updated) throw new GameSessionError('Game not found', 404);
    this.game = updated.game;
    this.players = updated.players;
    this.roundGuesses = updated.roundGuesses;
  }

  async join(playerName: string): Promise<{ playerId: string }> {
    const trimmed = playerName.trim();
    if (!trimmed || trimmed.length > 32) {
      throw new GameSessionError('Player name must be 1–32 characters');
    }

    const player = await db.$transaction(async (tx) => {
      const game = await lockGame(tx, this.game.id);
      if (!game) throw new GameSessionError('Game not found', 404);
      if (game.status !== 'waiting') throw new GameSessionError('Game has already started', 409);

      const playerCount = await tx.multiplayer_players.count({ where: { game_id: game.id } });
      if (playerCount >= MAX_PLAYERS) {
        throw new GameSessionError(`Room is full (maximum ${MAX_PLAYERS} players)`, 409);
      }

      const created = await tx.multiplayer_players.create({
        data: { game_id: game.id, name: trimmed, health: game.max_health },
      });
      await tx.multiplayer_games.update({
        where: { id: game.id },
        data: { revision: { increment: 1 } },
      });
      return created;
    });

    await this.refresh();
    return { playerId: player.id };
  }

  async start(): Promise<void> {
    const artifact = await pickRandomArtifact();
    if (!artifact) throw new GameSessionError('Could not find an artifact — try again', 503);

    await db.$transaction(async (tx) => {
      const game = await lockGame(tx, this.game.id);
      if (!game) throw new GameSessionError('Game not found', 404);
      if (game.status !== 'waiting') throw new GameSessionError('Game is not in waiting state', 409);
      const playerCount = await tx.multiplayer_players.count({ where: { game_id: game.id } });
      if (playerCount < 2) throw new GameSessionError('Need at least 2 players to start', 400);

      await tx.multiplayer_games.update({
        where: { id: game.id },
        data: {
          status: 'active', current_round: 1,
          object_id: artifact.objectId, artifact_iso3: artifact.iso3,
          artifact_begin_year: artifact.beginYear, artifact_end_year: artifact.endYear,
          artifact_image_url: artifact.imageUrl, artifact_title: artifact.title,
          round_ends_at: null, round_starts_at: null, revision: { increment: 1 },
        },
      });
    });
    await this.refresh();
  }

  async submitGuess(playerId: string, country: string, year: number): Promise<GuessResult> {
    if (!this.game.artifact_iso3 || this.game.artifact_begin_year == null || this.game.artifact_end_year == null) {
      throw new GameSessionError('Game artifact is not set', 500);
    }

    const normalizedCountry = country.toUpperCase();
    const score = await ScoringModule.calculateScore(
      normalizedCountry, this.game.artifact_iso3, year,
      this.game.artifact_begin_year, this.game.artifact_end_year,
    );
    const activePlayerCount = this.players.filter((player) => !player.is_eliminated).length;
    const likelyToResolve = this.roundGuesses.length + 1 >= activePlayerCount;
    // Artifact selection can require database work. Keep ordinary guesses on the
    // fast path and only prefetch when this guess is expected to end the round.
    const nextArtifact = likelyToResolve ? await pickRandomArtifact() : null;

    const result = await db.$transaction(async (tx) => {
      const game = await lockGame(tx, this.game.id);
      if (!game) throw new GameSessionError('Game not found', 404);
      if (game.status !== 'active') {
        throw new GameSessionError(`Game is not active (status: ${game.status})`, 409);
      }
      if (
        game.current_round !== this.game.current_round ||
        game.object_id !== this.game.object_id
      ) {
        throw new GameSessionError('Round changed while the guess was being scored; please try again', 409);
      }

      const now = await databaseNow(tx);
      if (game.round_starts_at && now < game.round_starts_at) {
        throw new GameSessionError('The next round has not started yet', 409);
      }
      if (game.round_ends_at && now >= game.round_ends_at) {
        const resolved = await this.resolveLocked(tx, game, now, nextArtifact);
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

      const startsTimer = game.round_ends_at === null;
      const roundEndsAt = startsTimer
        ? new Date(now.getTime() + game.countdown_seconds * 1000)
        : game.round_ends_at;

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
          round_ends_at: roundEndsAt,
          revision: { increment: startsTimer ? 2 : 1 },
        },
      });
      const roundResolved = await this.resolveLocked(tx, updatedGame, now, nextArtifact);
      return { late: false as const, score, roundResolved };
    });

    await this.refresh();
    if (result.late) {
      throw new GameSessionError('Round has ended; this guess was not accepted', 409, result.resolved);
    }
    return { score: result.score, roundResolved: result.roundResolved };
  }

  async resolveRoundIfNeeded(): Promise<boolean> {
    if (this.game.status !== 'active') return false;
    const activePlayerCount = this.players.filter((player) => !player.is_eliminated).length;
    const timerExpired = this.game.round_ends_at !== null && new Date() >= this.game.round_ends_at;
    const allGuessed = this.roundGuesses.length >= activePlayerCount;
    if (!timerExpired && !allGuessed) return false;

    const nextArtifact = await pickRandomArtifact();
    const resolved = await db.$transaction(async (tx) => {
      const game = await lockGame(tx, this.game.id);
      if (!game || game.status !== 'active') return false;
      return this.resolveLocked(tx, game, await databaseNow(tx), nextArtifact);
    });
    if (resolved) await this.refresh();
    return resolved;
  }

  private async resolveLocked(
    tx: Transaction,
    game: multiplayer_games,
    now: Date,
    nextArtifact: SelectedArtifact | null,
  ): Promise<boolean> {
    if (game.status !== 'active') return false;
    const [guesses, players] = await Promise.all([
      tx.multiplayer_guesses.findMany({
        where: { game_id: game.id, round_number: game.current_round },
      }),
      tx.multiplayer_players.findMany({ where: { game_id: game.id } }),
    ]);
    const activePlayers = players.filter((player) => !player.is_eliminated);
    const timerExpired = game.round_ends_at !== null && now >= game.round_ends_at;
    const allGuessed = guesses.length >= activePlayers.length;
    if (!timerExpired && !allGuessed) return false;

    // A concurrent guess can make a request that looked non-final become final
    // after it acquires the lock. Commit that guess promptly; the game-row
    // invalidation/status recovery will resolve it with a prefetched artifact.
    // Return before applying any damage so resolution stays all-or-nothing.
    const definitelyGameOver = activePlayers.length <= 1 || game.current_round >= game.max_rounds;
    if (!definitelyGameOver && !nextArtifact) return false;

    const maxScore = guesses.length ? Math.max(...guesses.map((guess) => guess.total_score)) : 0;
    const healthBeforeRound = Object.fromEntries(players.map((player) => [player.id, player.health]));
    for (const player of activePlayers) {
      const guess = guesses.find((item) => item.player_id === player.id);
      const newHealth = Math.max(0, player.health - (maxScore - (guess?.total_score ?? 0)));
      await tx.multiplayer_players.update({
        where: { id: player.id },
        data: { health: newHealth, is_eliminated: newHealth <= 0 },
      });
      if (!guess) {
        await tx.multiplayer_guesses.create({
          data: {
            game_id: game.id, player_id: player.id,
            round_number: game.current_round, total_score: 0, submitted_at: now,
          },
        });
      }
    }

    const updatedPlayers = await tx.multiplayer_players.findMany({ where: { game_id: game.id } });
    const revealGuesses = await tx.multiplayer_guesses.findMany({
      where: { game_id: game.id, round_number: game.current_round },
    });
    const playersById = Object.fromEntries(updatedPlayers.map((player) => [player.id, player]));
    const reveal: LastRoundReveal = {
      round: game.current_round,
      artifactIso3: game.artifact_iso3!,
      artifactBeginYear: game.artifact_begin_year!,
      artifactEndYear: game.artifact_end_year!,
      artifactTitle: game.artifact_title ?? null,
      artifactImageUrl: game.artifact_image_url ?? null,
      guesses: updatedPlayers.map((player) => {
        const guess = revealGuesses.find((item) => item.player_id === player.id);
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

    if (gameOver) {
      await tx.multiplayer_games.update({
        where: { id: game.id },
        data: {
          status: 'finished', last_round_reveal: reveal as unknown as Prisma.InputJsonValue,
          round_history: roundHistory,
          round_starts_at: null,
          revision: { increment: 1 },
        },
      });
    } else {
      await tx.multiplayer_games.update({
        where: { id: game.id },
        data: {
          current_round: game.current_round + 1,
          object_id: nextArtifact!.objectId, artifact_iso3: nextArtifact!.iso3,
          artifact_begin_year: nextArtifact!.beginYear, artifact_end_year: nextArtifact!.endYear,
          artifact_image_url: nextArtifact!.imageUrl, artifact_title: nextArtifact!.title,
          round_ends_at: null,
          round_starts_at: new Date(now.getTime() + 20_000),
          last_round_reveal: reveal as unknown as Prisma.InputJsonValue,
          round_history: roundHistory,
          revision: { increment: 2 },
        },
      });
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
      serverTime: new Date().toISOString(),
      status: this.game.status as GameStatusResponse['status'],
      currentRound: this.game.current_round,
      maxRounds: this.game.max_rounds,
      maxHealth: this.game.max_health,
      countdownSeconds: this.game.countdown_seconds,
      hostId: players[0]?.id ?? null,
      currentArtifact: this.game.artifact_image_url ? { imageUrl: this.game.artifact_image_url } : null,
      roundStartsAt: this.game.round_starts_at?.toISOString() ?? null,
      roundEndsAt: this.game.round_ends_at?.toISOString() ?? null,
      players: players.map((player) => ({
        id: player.id, name: player.name, health: player.health,
        isEliminated: player.is_eliminated,
        hasGuessedThisRound: guessedIds.has(player.id),
      })),
      lastRoundReveal,
      roundHistory,
    };
  }

  async broadcastState(): Promise<void> {
    try {
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
