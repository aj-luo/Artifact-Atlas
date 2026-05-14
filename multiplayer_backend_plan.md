# Multiplayer Mode Backend Architecture

This document outlines the architecture and implementation plan for the new multiplayer mode backend.

## Deployment Environment Context

**Deployment Environment:** Since the backend is a Next.js App Router API, maintaining long-lived in-memory state (like `setInterval` timers or an in-memory `Map` of game objects) works locally and on a standard Node server, but **fails on serverless environments like Vercel** due to request isolation and function timeouts. 

**Proposed Solution:** To comply with the request to "use object-oriented paradigms," the backend will use OOP classes (`GameSession`, `Player`, `RoundManager`) that encapsulate the game logic, but these objects will hydrate from and save to the **PostgreSQL database (Prisma)** to ensure persistence. Timers will be handled lazily (e.g., when the first guess is made, we store `round_timer_ends_at` in the DB, and any subsequent requests check against that timestamp). 

## Proposed Changes

### 1. Database Schema (`prisma/schema.prisma`)

We will add additive tables to handle multiplayer sessions without disrupting the single-player code.

#### [MODIFY] `prisma/schema.prisma`
- **`multiplayer_games`**: `id`, `status` (waiting, active, finished), `current_round`, `artifact_id` (current artifact), `round_ends_at` (for the 20s timer), `created_at`.
- **`multiplayer_players`**: `id`, `game_id`, `name`, `health` (default 25000), `is_eliminated`, `created_at`.
- **`multiplayer_guesses`**: `id`, `game_id`, `player_id`, `round_number`, `country_guessed`, `year_guessed`, `distance_km`, `years_away`, `score_country`, `score_year`, `total_score`, `submitted_at`.

### 2. Scoring Module

#### [NEW] `backend/lib/multiplayer/scoring.ts`
We will extract an OOP-based scoring module.
```typescript
export class ScoringModule {
  static readonly MAX_SCORE = 5000;
  static readonly MAX_COUNTRY_SCORE = 2500;
  static readonly MAX_YEAR_SCORE = 2500;

  static calculateScore(distanceKm: number, guessedYear: number, actualBeginYear: number, actualEndYear: number) {
    // Distance calculation: -1 pt per km. 0 pts if >= 2500km.
    const distanceScore = Math.max(0, this.MAX_COUNTRY_SCORE - distanceKm);
    
    // Year calculation: -25 pts per year away. 0 pts if >= 100 years away.
    let yearsAway = 0;
    if (guessedYear < actualBeginYear) yearsAway = actualBeginYear - guessedYear;
    else if (guessedYear > actualEndYear) yearsAway = guessedYear - actualEndYear;
    
    const yearScore = Math.max(0, this.MAX_YEAR_SCORE - (25 * yearsAway));
    
    return {
      countryScore: distanceScore,
      yearScore: yearScore,
      totalScore: distanceScore + yearScore
    };
  }
}
```

### 3. Game State OOP Encapsulation

#### [NEW] `backend/lib/multiplayer/GameSession.ts`
An object-oriented class that wraps the database state to perform business logic:
- `join(playerName)`: Creates a player with 25000 HP.
- `start()`: Transitions game from 'waiting' to 'active'. Loads the first artifact.
- `submitGuess(playerId, country, year)`:
  - If it's the first guess of the round, sets `round_ends_at = now() + 20 seconds`.
  - Calculates the score using `ScoringModule`.
  - Checks if all non-eliminated players have guessed. If so, resolves the round immediately.
- `resolveRoundIfNeeded()`: 
  - Called implicitly on guesses or explicitly via a polling/status endpoint.
  - Checks if `round_ends_at` has passed or all players submitted.
  - If resolving:
    - Finds the max score `x` among submissions.
    - For each player with score `pt_i` (0 if no guess submitted), deducts `x - pt_i` from their health.
    - Updates `is_eliminated` for health <= 0.
    - If 1 or 0 players remain, sets game to 'finished'.
    - Otherwise, picks a new artifact and increments `current_round`.

### 4. API Endpoints

#### [NEW] `backend/app/api/multiplayer/create/route.ts`
Creates a new game session and returns the shareable ID.

#### [NEW] `backend/app/api/multiplayer/[gameId]/join/route.ts`
Allows a player to join and returns their `playerId`.

#### [NEW] `backend/app/api/multiplayer/[gameId]/status/route.ts`
Returns the synchronized game state (current round, players, health, timer, etc.). The frontend will poll this or use Supabase Realtime to listen for DB changes.

#### [NEW] `backend/app/api/multiplayer/[gameId]/guess/route.ts`
Accepts a player's guess. Triggers the 20s timer on the first guess and implicitly resolves the round if the timer expired.
