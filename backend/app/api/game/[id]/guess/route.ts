import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCapitals } from '@/lib/capitals';
import { bearing, yearHint } from '@/lib/geo';
import { gameStore, MAX_GUESSES, type GuessRecord } from '@/lib/gameStore';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/game/:gameId/guess
 *
 * Normal guess: { "country": "CAN", "year": 1965 }
 * Forfeit:      { "forfeit": true }
 *
 * Game state is read from in-memory store.
 * DB is written to as an audit log only.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id: gameId } = await params;
  const body = await req.json();
  const { country, year, forfeit } = body as {
    country?: string;
    year?: number;
    forfeit?: boolean;
  };

  // ── Resolve game from memory ──────────────────────────────────────────────
  const game = gameStore.get(gameId);
  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }
  if (game.status !== 'active') {
    return NextResponse.json({ error: `Game already ${game.status}` }, { status: 409 });
  }

  // ── Forfeit ───────────────────────────────────────────────────────────────
  if (forfeit) {
    game.status      = 'forfeited';
    game.guessesLeft = 0;

    // Audit log
    await db.game_status.create({
      data: {
        game_id:         gameId,
        guess_number:    game.guesses.length + 1,
        country_guessed: 'FORFEIT',
        object_uuid:     game.objectId,
        is_correct:      false,
      },
    });

    return NextResponse.json({ gameStatus: 'forfeited', guessesLeft: 0 });
  }

  // ── Validate guess fields ─────────────────────────────────────────────────
  if (!country || year === undefined) {
    return NextResponse.json(
      { error: '"country" (ISO alpha-3) and "year" are required, or pass forfeit: true' },
      { status: 400 },
    );
  }

  const guessedIso3 = country.toUpperCase();
  const isSameCountry = guessedIso3 === game.artifactIso3;

  // ── Distance — DistMatrix (single DB read, only when countries differ) ────
  let distKm = 0;
  if (!isSameCountry) {
    const entry = await db.distMatrix.findUnique({
      where: { iso_o_iso_d: { iso_o: guessedIso3, iso_d: game.artifactIso3 } },
      select: { distcap: true },
    });
    distKm = entry?.distcap ?? 0;
  }

  // ── Bearing — capitals cache (no DB hit after first load) ─────────────────
  let bear = 0;
  if (!isSameCountry) {
    const capitals = await getCapitals();
    const from = capitals.get(guessedIso3);
    const to   = capitals.get(game.artifactIso3);
    if (from && to) bear = bearing(from.lat, from.lng, to.lat, to.lng);
  }

  // ── Year hint (pure computation) ──────────────────────────────────────────
  const hint = yearHint(game.artifactYear, Number(year));
  const won  = isSameCountry && hint === 'Correct';

  const record: GuessRecord = {
    guessNumber: game.guesses.length + 1,
    country:     guessedIso3,
    year:        Number(year),
    bearing:     parseFloat(bear.toFixed(3)),
    distanceKm:  Math.round(distKm),
    geoDisplay:  isSameCountry ? '0.000°, 0km' : `${bear.toFixed(3)}°, ${Math.round(distKm)}km`,
    yearHint:    hint,
    correct:     won,
  };

  // ── Update in-memory state ────────────────────────────────────────────────
  game.guesses.push(record);
  game.guessesLeft = MAX_GUESSES - game.guesses.length;
  game.status = won
    ? 'won'
    : game.guessesLeft === 0
    ? 'lost'
    : 'active';

  // ── Audit log write (fire-and-forget style, non-blocking) ─────────────────
  db.game_status.create({
    data: {
      game_id:          gameId,
      guess_number:     record.guessNumber,
      country_guessed:  record.country,
      time_guessed:     new Date(Number(year), 0, 1),
      object_uuid:      game.objectId,
      country_distance: record.distanceKm,
      time_distance:    BigInt(Math.abs(game.artifactYear - Number(year))),
      is_correct:       won,
    },
  }).catch(console.error);

  return NextResponse.json({
    guessNumber:  record.guessNumber,
    guessesLeft:  game.guessesLeft,
    gameStatus:   game.status,
    geo: {
      bearing:    record.bearing,
      distanceKm: record.distanceKm,
      display:    record.geoDisplay,
    },
    year: { hint },
  });
}
