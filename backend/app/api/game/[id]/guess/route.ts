import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { yearHint } from '@/lib/geo';
import { getGeoForPair } from '@/lib/geoCache';
import { getGame, setGame, MAX_GUESSES, type GuessRecord } from '@/lib/gameStore';

type Params = { params: Promise<{ id: string }> };

function get_cardinal_from_bearing(b: number): string {
  if (b >= 337.5 || b < 22.5)  return 'N';
  if (b < 67.5)  return 'NE';
  if (b < 112.5) return 'E';
  if (b < 157.5) return 'SE';
  if (b < 202.5) return 'S';
  if (b < 247.5) return 'SW';
  if (b < 292.5) return 'W';
  return 'NW';
}

/**
 * POST /api/game/:gameId/guess
 *
 * Normal guess: { "country": "CAN", "year": 1965 }
 * Forfeit:      { "forfeit": true }
 *
 * Game state is read from and written to the active_games DB table.
 * Geo pair distances are cached via Next.js Data Cache (persistent across restarts).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
  const { id: gameId } = await params;
  const body = await req.json();
  const { country, year, forfeit } = body as {
    country?: string;
    year?: number;
    forfeit?: boolean;
  };

  // ── Resolve game from DB ──────────────────────────────────────────────────
  const game = await getGame(gameId);
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
    await setGame(game);

    db.game_status.create({
      data: {
        game_id:         gameId,
        guess_number:    game.guesses.length + 1,
        country_guessed: 'FORFEIT',
        object_uuid:     game.objectId,
        is_correct:      false,
      },
    }).catch(console.error);

    return NextResponse.json({
      gameStatus:  'forfeited',
      guessesLeft: 0,
      artifact: {
        objectId:     game.objectId.toString(),
        country:      game.artifactIso3,
        beginYear:    game.artifactBeginYear,
        endYear:      game.artifactEndYear,
        title:        game.title,
        imageUrl:     game.imageUrl,
        linkResource: game.linkResource,
      },
    });
  }

  // ── Validate guess fields ─────────────────────────────────────────────────
  if (!country || year === undefined) {
    return NextResponse.json(
      { error: '"country" (ISO alpha-3) and "year" are required, or pass forfeit: true' },
      { status: 400 },
    );
  }

  const guessedIso3   = country.toUpperCase();
  const isSameCountry = guessedIso3 === game.artifactIso3;

  // ── Geo: Data Cache-backed pair lookup ────────────────────────────────────
  let distKm = 0;
  let bear   = 0;
  if (!isSameCountry) {
    const geo = await getGeoForPair(guessedIso3, game.artifactIso3);
    distKm = geo.distKm;
    bear   = geo.bear;
  }

  // ── Year hint (pure computation) ──────────────────────────────────────────
  const hint = yearHint(game.artifactBeginYear, game.artifactEndYear, Number(year));
  const won  = isSameCountry && hint === 'Correct';

  const record: GuessRecord = {
    guessNumber: game.guesses.length + 1,
    country:     guessedIso3,
    year:        Number(year),
    bearing:     parseFloat(bear.toFixed(3)),
    cardinal:    isSameCountry ? '' : get_cardinal_from_bearing(bear),
    distanceKm:  Math.round(distKm),
    geoDisplay:  isSameCountry ? '0.000°, 0km' : `${bear.toFixed(3)}°, ${Math.round(distKm)}km`,
    yearHint:    hint,
    correct:     won,
  };

  // ── Update and persist game state ─────────────────────────────────────────
  game.guesses.push(record);
  game.status = won
    ? 'won'
    : game.guesses.length >= MAX_GUESSES
    ? 'lost'
    : 'active';
  game.guessesLeft = game.status === 'active'
    ? MAX_GUESSES - game.guesses.length
    : 0;

  await setGame(game);

  // ── Audit log (fire-and-forget) ───────────────────────────────────────────
  db.game_status.create({
    data: {
      game_id:          gameId,
      guess_number:     record.guessNumber,
      country_guessed:  record.country,
      time_guessed:     new Date(Number(year), 0, 1),
      object_uuid:      game.objectId,
      country_distance: record.distanceKm,
      time_distance:    BigInt(Math.max(0, game.artifactBeginYear - Number(year), Number(year) - game.artifactEndYear)),
      is_correct:       won,
    },
  }).catch(console.error);

  const reveal = game.status !== 'active'
    ? {
        objectId:     game.objectId.toString(),
        country:      game.artifactIso3,
        beginYear:    game.artifactBeginYear,
        endYear:      game.artifactEndYear,
        title:        game.title,
        imageUrl:     game.imageUrl,
        linkResource: game.linkResource,
      }
    : undefined;

  return NextResponse.json({
    guessNumber:  record.guessNumber,
    guessesLeft:  game.guessesLeft,
    gameStatus:   game.status,
    geo: {
      countryCorrect: isSameCountry,
      cardinal:       record.cardinal,
      distanceKm:     record.distanceKm,
    },
    year: { hint },
    ...(reveal && { artifact: reveal }),
  });
  } catch (err) {
    console.error('[game/guess] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

