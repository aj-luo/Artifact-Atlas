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

        // Fetch all players matching game_id
        const players = await db.party_players.findMany({
            where: { game_id: gameId },
        });

        return NextResponse.json({
            number_players: game.number_players,
            players: players.map(player => ({
                id: player.id,
                name: player.name,
            })),
        }, { status: 200 });

    } catch (err) {
        console.error('[party/get] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}