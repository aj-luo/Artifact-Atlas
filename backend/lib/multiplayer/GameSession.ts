import { db } from '@/lib/db';
import { pickRandomArtifact } from '@/lib/artifactSelector';
import { ScoringModule, type ScoreResult } from './scoring';
import type { multiplayer_games, multiplayer_players, multiplayer_guesses } from '@prisma/client';

// ── Public response types ──────────────────────────────────────────────────────

export interface PlayerStatus {
  id:                  string;
  name:                string;
  health:              number;
  isEliminated:        boolean;
  hasGuessedThisRound: boolean;
}

export interface RoundGuessResult {
  playerId:       string;
  playerName:     string;
  countryGuessed: string | null;
  yearGuessed:    number | null;
  distanceKm:     number | null;
  yearsAway:      number | null;
  totalScore:     number;
}

export interface LastRoundReveal {
  round:             number;
  artifactIso3:      string;
  artifactBeginYear: number;
  artifactEndYear:   number;
  artifactTitle:     string | null;
  guesses:           RoundGuessResult[];
}

export interface GameStatusResponse {
  gameId:          string;
  status:          'waiting' | 'active' | 'finished';
  currentRound:    number;
  maxRounds:       number;
  currentArtifact: { imageUrl: string } | null;
  roundEndsAt:     string | null;
  players:         PlayerStatus[];
  lastRoundReveal: LastRoundReveal | null;
}

export interface GuessResult {
  score:         ScoreResult;
  roundResolved: boolean;
}

// ── Error types ────────────────────────────────────────────────────────────────

export class GameSessionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'GameSessionError';
  }
}

// ── GameSession ────────────────────────────────────────────────────────────────

export class GameSession {
  private constructor(
    private game: multiplayer_games,
    private players: multiplayer_players[],
    private roundGuesses: multiplayer_guesses[],
  ) {}

  /**
   * Load an existing game from the database, hydrating players and current-round
   * guesses. Returns null if the game does not exist.
   */
  static async load(gameId: string): Promise<GameSession | null> {
    const game = await db.multiplayer_games.findUnique({
      where: { id: gameId },
    });
    if (!game) return null;

    const [players, roundGuesses] = await Promise.all([
      db.multiplayer_players.findMany({ where: { game_id: gameId } }),
      db.multiplayer_guesses.findMany({
        where: { game_id: gameId, round_number: game.current_round },
      }),
    ]);

    return new GameSession(game, players, roundGuesses);
  }

  // ── Lobby phase ─────────────────────────────────────────────────────────────

  /**
   * Add a player to a waiting game. Returns the new player's ID.
   * Throws if the game is not in 'waiting' state.
   */
  async join(playerName: string): Promise<{ playerId: string }> {
    if (this.game.status !== 'waiting') {
      throw new GameSessionError('Game has already started', 409);
    }

    const trimmed = playerName.trim();
    if (!trimmed || trimmed.length > 32) {
      throw new GameSessionError('Player name must be 1–32 characters', 400);
    }

    const player = await db.multiplayer_players.create({
      data: { game_id: this.game.id, name: trimmed },
    });

    this.players.push(player);
    return { playerId: player.id };
  }

  /**
   * Transition from 'waiting' → 'active'. Picks the first artifact and sets
   * current_round to 1. Requires at least 2 players.
   */
  async start(): Promise<void> {
    if (this.game.status !== 'waiting') {
      throw new GameSessionError('Game is not in waiting state', 409);
    }
    if (this.players.length < 2) {
      throw new GameSessionError('Need at least 2 players to start', 400);
    }

    const artifact = await pickRandomArtifact();
    if (!artifact) {
      throw new GameSessionError('Could not find an artifact — try again', 503);
    }

    this.game = await db.multiplayer_games.update({
      where: { id: this.game.id },
      data: {
        status:              'active',
        current_round:       1,
        object_id:           artifact.objectId,
        artifact_iso3:       artifact.iso3,
        artifact_begin_year: artifact.beginYear,
        artifact_end_year:   artifact.endYear,
        artifact_image_url:  artifact.imageUrl,
        artifact_title:      artifact.title,
        round_ends_at:       null,
      },
    });
  }

  // ── Active phase ─────────────────────────────────────────────────────────────

  /**
   * Submit a guess for the current round.
   *
   * - Validates that the player is active and hasn't guessed yet this round.
   * - Sets round_ends_at on the first guess of a round (starts the 20s timer).
   * - Calculates the score and persists the guess.
   * - Triggers round resolution if all active players have guessed or the timer
   *   has expired.
   */
  async submitGuess(
    playerId: string,
    country: string,
    year: number,
  ): Promise<GuessResult> {
    if (this.game.status !== 'active') {
      throw new GameSessionError(`Game is not active (status: ${this.game.status})`, 409);
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) throw new GameSessionError('Player not found in this game', 404);
    if (player.is_eliminated) throw new GameSessionError('Player is eliminated', 409);

    const alreadyGuessed = this.roundGuesses.some(g => g.player_id === playerId);
    if (alreadyGuessed) throw new GameSessionError('Already submitted a guess this round', 409);

    if (!this.game.artifact_iso3 || this.game.artifact_begin_year == null || this.game.artifact_end_year == null) {
      throw new GameSessionError('Game artifact is not set', 500);
    }

    // Start the 20s timer on the first guess of the round
    const isFirstGuess = this.roundGuesses.length === 0 && this.game.round_ends_at === null;
    if (isFirstGuess) {
      this.game = await db.multiplayer_games.update({
        where: { id: this.game.id },
        data:  { round_ends_at: new Date(Date.now() + 20_000) },
      });
    }

    // Score the guess (artifact fields asserted non-null — guarded above)
    const score = await ScoringModule.calculateScore(
      country.toUpperCase(),
      this.game.artifact_iso3!,
      year,
      this.game.artifact_begin_year!,
      this.game.artifact_end_year!,
    );

    // Persist guess
    const guess = await db.multiplayer_guesses.create({
      data: {
        game_id:         this.game.id,
        player_id:       playerId,
        round_number:    this.game.current_round,
        country_guessed: country.toUpperCase(),
        year_guessed:    year,
        distance_km:     score.distanceKm,
        years_away:      score.yearsAway,
        score_country:   score.countryScore,
        score_year:      score.yearScore,
        total_score:     score.totalScore,
      },
    });

    this.roundGuesses.push(guess);

    const roundResolved = await this.resolveRoundIfNeeded();

    return { score, roundResolved };
  }

  /**
   * Check whether the current round should resolve (all active players guessed
   * OR the 20s timer has expired). If so, apply HP damage, advance the round
   * or finish the game.
   *
   * Safe to call concurrently — uses an optimistic current_round check inside a
   * transaction to prevent double-resolution.
   *
   * Returns true if a resolution actually happened this call.
   */
  async resolveRoundIfNeeded(): Promise<boolean> {
    const activePlayers  = this.players.filter(p => !p.is_eliminated);
    const timerExpired   = this.game.round_ends_at !== null && new Date() > this.game.round_ends_at;
    const allGuessed     = this.roundGuesses.length >= activePlayers.length;

    if (!timerExpired && !allGuessed) return false;

    // Use a transaction with an optimistic lock: re-fetch inside to ensure we
    // only resolve once even if two requests race here simultaneously.
    const resolved = await db.$transaction(async (tx) => {
      const fresh = await tx.multiplayer_games.findUnique({ where: { id: this.game.id } });
      if (!fresh) return false;
      // If current_round changed, another request already resolved this round
      if (fresh.current_round !== this.game.current_round) return false;
      if (fresh.status !== 'active') return false;

      // Re-check conditions using the freshly fetched row
      const freshGuesses = await tx.multiplayer_guesses.findMany({
        where: { game_id: this.game.id, round_number: fresh.current_round },
      });
      const freshPlayers = await tx.multiplayer_players.findMany({
        where: { game_id: this.game.id },
      });
      const freshActive   = freshPlayers.filter(p => !p.is_eliminated);
      const freshTimer    = fresh.round_ends_at !== null && new Date() > fresh.round_ends_at;
      const freshAllDone  = freshGuesses.length >= freshActive.length;

      if (!freshTimer && !freshAllDone) return false;

      // ── Apply HP damage ────────────────────────────────────────────────────
      const maxScore = freshGuesses.length > 0
        ? Math.max(...freshGuesses.map(g => g.total_score))
        : 0;

      const playerUpdates: Promise<unknown>[] = [];
      const zeroGuessInserts: Promise<unknown>[] = [];

      for (const p of freshActive) {
        const guess       = freshGuesses.find(g => g.player_id === p.id);
        const playerScore = guess?.total_score ?? 0;
        const damage      = maxScore - playerScore;
        const newHealth   = Math.max(0, p.health - damage);
        const eliminated  = newHealth <= 0;

        playerUpdates.push(
          tx.multiplayer_players.update({
            where: { id: p.id },
            data:  { health: newHealth, is_eliminated: eliminated },
          }),
        );

        // Insert a zero-score record for players who didn't submit in time
        if (!guess) {
          zeroGuessInserts.push(
            tx.multiplayer_guesses.create({
              data: {
                game_id:      this.game.id,
                player_id:    p.id,
                round_number: fresh.current_round,
                total_score:  0,
              },
            }),
          );
        }
      }

      await Promise.all([...playerUpdates, ...zeroGuessInserts]);

      // Re-fetch updated players to check remaining active count
      const updatedPlayers = await tx.multiplayer_players.findMany({
        where: { game_id: this.game.id },
      });
      const remaining = updatedPlayers.filter(p => !p.is_eliminated);

      // ── Build reveal JSON ──────────────────────────────────────────────────
      const allGuessesForReveal = await tx.multiplayer_guesses.findMany({
        where: { game_id: this.game.id, round_number: fresh.current_round },
      });
      const playerMap = Object.fromEntries(updatedPlayers.map(p => [p.id, p.name]));

      const lastRoundReveal: LastRoundReveal = {
        round:             fresh.current_round,
        artifactIso3:      fresh.artifact_iso3!,
        artifactBeginYear: fresh.artifact_begin_year!,
        artifactEndYear:   fresh.artifact_end_year!,
        artifactTitle:     fresh.artifact_title ?? null,
        guesses: allGuessesForReveal.map(g => ({
          playerId:       g.player_id,
          playerName:     playerMap[g.player_id] ?? 'Unknown',
          countryGuessed: g.country_guessed ?? null,
          yearGuessed:    g.year_guessed ?? null,
          distanceKm:     g.distance_km != null ? Math.round(g.distance_km) : null,
          yearsAway:      g.years_away ?? null,
          totalScore:     g.total_score,
        })),
      };

      // ── Advance or finish ──────────────────────────────────────────────────
      const gameOver = remaining.length <= 1 || fresh.current_round >= fresh.max_rounds;

      if (gameOver) {
        await tx.multiplayer_games.update({
          where: { id: this.game.id },
          data:  { status: 'finished', last_round_reveal: lastRoundReveal as object },
        });
      } else {
        const nextArtifact = await pickRandomArtifact();
        if (!nextArtifact) throw new Error('Could not find next artifact');

        await tx.multiplayer_games.update({
          where: { id: this.game.id },
          data: {
            current_round:       fresh.current_round + 1,
            object_id:           nextArtifact.objectId,
            artifact_iso3:       nextArtifact.iso3,
            artifact_begin_year: nextArtifact.beginYear,
            artifact_end_year:   nextArtifact.endYear,
            artifact_image_url:  nextArtifact.imageUrl,
            artifact_title:      nextArtifact.title,
            round_ends_at:       null,
            last_round_reveal:   lastRoundReveal as object,
          },
        });
      }

      return true;
    });

    if (resolved) {
      // Refresh local state so getStatus() returns current data
      const updated = await GameSession.load(this.game.id);
      if (updated) {
        this.game         = updated.game;
        this.players      = updated.players;
        this.roundGuesses = updated.roundGuesses;
      }
    }

    return resolved;
  }

  // ── Read ─────────────────────────────────────────────────────────────────────

  /**
   * Serialize current in-memory state to the API response shape.
   * Call resolveRoundIfNeeded() before this for the most up-to-date view.
   */
  getStatus(): GameStatusResponse {
    const guessedPlayerIds = new Set(this.roundGuesses.map(g => g.player_id));

    return {
      gameId:       this.game.id,
      status:       this.game.status as 'waiting' | 'active' | 'finished',
      currentRound: this.game.current_round,
      maxRounds:    this.game.max_rounds,
      currentArtifact: this.game.artifact_image_url
        ? { imageUrl: this.game.artifact_image_url }
        : null,
      roundEndsAt: this.game.round_ends_at?.toISOString() ?? null,
      players: this.players.map(p => ({
        id:                  p.id,
        name:                p.name,
        health:              p.health,
        isEliminated:        p.is_eliminated,
        hasGuessedThisRound: guessedPlayerIds.has(p.id),
      })),
      lastRoundReveal: (this.game.last_round_reveal as LastRoundReveal | null) ?? null,
    };
  }
}
