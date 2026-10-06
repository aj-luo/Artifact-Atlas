import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/party/[gameId]/get
 */
export async function GET(
    req: NextRequest, 
    { params }: { params: Promise<{ gameId: string }> }
) { 
    try {
        // Await params to extract gameId from the route path segment
        const { gameId } = await params;

        if (!gameId) {
            return NextResponse.json({ error: 'Game ID is required' }, { status: 400 });
        }

        // Fetch game session from db using gameId
        const game = await db.party_games.findUnique({
            where: { id: gameId },
        });

        if (!game) {
            return NextResponse.json({ error: 'Game not found' }, { status: 404 });
        }

        // Extract player IDs from the JSON column (defaulting to an empty array)
        const playerIds: string[] = Array.isArray(game.players) ? (game.players as string[]) : [];

        // Fetch all players matching the IDs listed in the JSON array
        const players = await db.party_players.findMany({
            where: {
                id: {
                    in: playerIds,
                },
            },
        });

        // Map players into a dictionary for quick lookup by ID
        const playerMap = new Map(players.map((p) => [p.id, p.name]));

        // Preserve the exact join order defined in game.players
        const orderedPlayers = playerIds
            .map((id) => {
                const name = playerMap.get(id);
                return name ? { id, name } : null;
            })
            .filter((p): p is { id: string; name: string } => p !== null);

        return NextResponse.json({
            number_players: game.number_players,
            players: orderedPlayers,
        }, { status: 200 });

    } catch (err) {
        console.error('[party/get] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}