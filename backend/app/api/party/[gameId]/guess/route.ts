import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Params = { params: Promise<{ gameId: string }> };

/**
 * POST /api/party/:gameId/guess
 *
 * Body: { playerId: string }
 *
 * Checks if the chosen player is the archeologist and updates game status to 'done'
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;
    const body = await req.json();

    const playerId = typeof body?.playerId === 'string' ? body.playerId.trim() : '';

    if (!playerId) {
      return NextResponse.json(
        { error: 'playerId is required' },
        { status: 400 }
      );
    }

    // 1. Fetch current descriptions and archeologist field for this game
    const { data: game, error: fetchError } = await supabase
      .from('party_games')
      .select('descriptions, archeologist')
      .eq('id', gameId)
      .single();

    if (fetchError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // 2. Compare the payload playerId to the stored archeologist ID
    const isArcheologist = String(game.archeologist) === playerId;

    // 3. Update the game status to 'done'
    const { error: updateError } = await supabase
      .from('party_games')
      .update({ status: 'done' })
      .eq('id', gameId);

    if (updateError) {
      console.error('[party/guess] Failed to update game status:', updateError);
      return NextResponse.json({ error: 'Failed to update game status' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      isArcheologist 
    }, { status: 200 });

  } catch (err) {
    console.error('[party/guess] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}