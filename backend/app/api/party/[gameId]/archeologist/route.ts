import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

type Params = { params: Promise<{ gameId: string }> };

/**
 * GET /api/party/:gameId/archeologist
 *
 * Gets the archeologist name to return
 * Response: { nickname: 'sample' }
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;

    // Fetch the game details and related archeologist in one query.
    const game = await db.party_games.findUnique({
      where: { id: gameId },
      select: {
        archeologist: true,
        descriptions: true,
        artifact_url: true,
        party_players_party_games_archeologistToparty_players: {
          select: { name: true },
        },
      },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (!game.archeologist) {
      return NextResponse.json(
        { error: 'Archeologist has not been assigned yet' },
        { status: 400 }
      );
    }

    const player = game.party_players_party_games_archeologistToparty_players;
    if (!player) {
      return NextResponse.json(
        { error: 'Archeologist player record not found' },
        { status: 404 }
      );
    }

    const descriptions = game.descriptions && typeof game.descriptions === 'object'
      ? game.descriptions as Record<string, unknown>
      : {};
    const rawDescription = descriptions[game.archeologist];
    const archeologistDescription = typeof rawDescription === 'string'
      ? rawDescription
      : rawDescription && typeof rawDescription === 'object' && 'explanation' in rawDescription
        ? String(rawDescription.explanation ?? '')
        : '';

    return NextResponse.json({
      nickname: player.name,
      description: archeologistDescription,
      artifact_url: game.artifact_url,
    });
  } catch (err) {
    console.error('[Get Archeologist Error]:', err);

    return NextResponse.json(
      {
        error: 'There was an error retrieving the archeologist name',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
