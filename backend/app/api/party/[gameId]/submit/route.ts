import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type Params = { params: Promise<{ gameId: string }> };

type DescriptionEntry = {
  explanation: string;
  nickname: string;
};

/**
 * POST /api/party/:gameId/submit
 *
 * Body: { playerId: string, explanation: string, nickname?: string }
 *
 * Directly updates the `descriptions` JSONB object in `party_games`
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { gameId } = await params;
    const body = await req.json();

    const playerId = typeof body?.playerId === 'string' ? body.playerId.trim() : '';
    const explanation = typeof body?.explanation === 'string' ? body.explanation.trim() : '';
    const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : 'Anonymous';

    if (!playerId || !explanation) {
      return NextResponse.json(
        { error: 'playerId and explanation are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // 1. Fetch current descriptions for this game
    const { data: game, error: fetchError } = await supabase
      .from('party_games')
      .select('descriptions')
      .eq('id', gameId)
      .single();

    if (fetchError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // 2. Merge new description entry into existing JSONB descriptions object
    const currentDescriptions = (game.descriptions as Record<string, DescriptionEntry | string>) || {};
    
    const updatedDescriptions = {
      ...currentDescriptions,
      [playerId]: {
        explanation,
        nickname,
      },
    };

    // 3. Update the database record
    const { data: updatedGame, error: updateError } = await supabase
      .from('party_games')
      .update({ descriptions: updatedDescriptions })
      .eq('id', gameId)
      .select()
      .single();

    if (updateError) {
      console.error('[party/submit] DB update error:', updateError);
      return NextResponse.json({ error: 'Failed to update description' }, { status: 500 });
    }

    return NextResponse.json({ success: true, game: updatedGame }, { status: 200 });

  } catch (err) {
    console.error('[party/submit] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
