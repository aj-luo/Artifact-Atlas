import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCapitals } from '@/lib/capitals';
import { bearing, distanceKm, yearHint } from '@/lib/geo';
import { gameStore, pairCache, MAX_GUESSES, type GuessRecord } from '@/lib/gameStore';

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

  // ── Geo: pair cache → DB + trig only on first miss ────────────────────────
  let distKm = 0;
  let bear   = 0;
  if (!isSameCountry) {
    const key    = `${guessedIso3}->${game.artifactIso3}`;
    const cached = pairCache.get(key);

    console.log(`[geo] gameId=${gameId} guessedIso3=${guessedIso3} artifactIso3=${game.artifactIso3}`);

    if (cached) {
      distKm = cached.distKm;
      bear   = cached.bear;
      console.log(`[geo] pairCache HIT  key=${key}  distKm=${distKm} bear=${bear}`);
    } else {
      console.log(`[geo] pairCache MISS key=${key}`);

      // Fetch DistMatrix and capitals in parallel on cache miss
      const [entry, capitals] = await Promise.all([
        db.distMatrix.findUnique({
          where:  { iso_o_iso_d: { iso_o: guessedIso3, iso_d: game.artifactIso3 } },
          select: { distcap: true },
        }),
        getCapitals(),
      ]);

      console.log(`[geo] distMatrix result: ${entry?.distcap ?? 'null'}`);

      const from = capitals.get(guessedIso3);
      const to   = capitals.get(game.artifactIso3);
      console.log(`[geo] capitals from=${from ? `${guessedIso3}(${from.name})` : 'MISSING'} to=${to ? `${game.artifactIso3}(${to.name})` : 'MISSING'}`);

      if (entry?.distcap != null) {
        distKm = entry.distcap;
        if (from && to) bear = bearing(from.lat, from.lng, to.lat, to.lng);
        console.log(`[geo] distMatrix used → distKm=${distKm} bear=${bear}`);
      } else if (from && to) {
        distKm = distanceKm(from.lat, from.lng, to.lat, to.lng);
        bear   = bearing(from.lat, from.lng, to.lat, to.lng);
        console.log(`[geo] fallback calc used → distKm=${distKm} bear=${bear}`);
      } else {
        console.warn(`[geo] WARN: both lookups failed for ${key} → distKm=0 bear=0 (will be cached!)`);
      }

      pairCache.set(key, { distKm, bear });
    }
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

  // ── Update in-memory state ────────────────────────────────────────────────
  game.guesses.push(record);
  game.status = won
    ? 'won'
    : game.guesses.length >= MAX_GUESSES
    ? 'lost'
    : 'active';
  game.guessesLeft = game.status === 'lost' || game.status === 'forfeited'
    ? 0
    : MAX_GUESSES - game.guesses.length;

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
}
