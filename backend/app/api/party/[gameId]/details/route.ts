import { NextRequest, NextResponse } from 'next/server';
import { GameSession } from '@/lib/multiplayer/GameSession';
import { scheduleGameBroadcast } from '@/lib/multiplayer/scheduleBroadcast';
import { db } from '@/lib/db';

type Params = { params: Promise<{ gameId: string }> };

/**
 * GET /api/party:gameId/details
 *
 * Gets the time, the imagefrom the backend
 *
 * Response: GameStatusResponse
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

        //the image url
        const countdown_minutes = game.countdown_minutes
        const artifact_image_url = game.artifact_image_url

        return NextResponse.json({
            countdown_minutes: countdown_minutes,
            artifact_image_url: artifact_image_url
        }, { status: 200 });

    } catch (err) {
        console.error('[party/get] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
