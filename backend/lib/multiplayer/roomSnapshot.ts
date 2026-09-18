import { db } from '@/lib/db';
import { GameSessionError, type GameStatusResponse } from './GameSession';

export interface RoomSnapshot extends Omit<GameStatusResponse, 'gameId'> {
  roomId: string;
  autoAdvanceRounds: boolean;
  gameId: string | null;
  currentSessionId: string | null;
  sessionNumber: number;
  hostMemberId: string | null;
  members: Array<{ id: string; name: string }>;
}

// One PostgreSQL statement sees one MVCC snapshot. Reading the revision, roster,
// session and guesses together avoids both mixed revisions and network round trips.
// Select public fields explicitly; room member credential hashes never leave SQL.
export async function readRoomSnapshot(roomId: string): Promise<RoomSnapshot> {
  const rows = await db.$queryRaw<Array<{ snapshot: RoomSnapshot }>>`
    SELECT jsonb_build_object(
      'roomId', r.id, 'gameId', r.current_session_id, 'currentSessionId', r.current_session_id,
      'sessionNumber', r.session_count, 'revision', r.revision, 'serverTime', clock_timestamp(),
      'autoAdvanceRounds', r.auto_advance_rounds,
      'awaitingHost', r.status = 'active' AND COALESCE(g.awaiting_host, false),
      'status', r.status, 'hostMemberId', r.host_member_id,
      'hostId', CASE WHEN r.status = 'waiting' THEN r.host_member_id ELSE
        (SELECT p.id FROM multiplayer_players p WHERE p.game_id = g.id AND p.member_id = r.host_member_id LIMIT 1) END,
      'maxRounds', r.max_rounds, 'maxHealth', r.max_health, 'countdownSeconds', r.countdown_seconds,
      'currentRound', CASE WHEN r.status = 'waiting' THEN 0 ELSE g.current_round END,
      'roundStartsAt', CASE WHEN r.status = 'waiting' THEN NULL ELSE g.round_starts_at END,
      'roundEndsAt', CASE WHEN r.status = 'waiting' THEN NULL ELSE g.round_ends_at END,
      'resultsRevealAt', CASE WHEN r.status = 'waiting' THEN NULL ELSE g.results_reveal_at END,
      'currentArtifact', CASE WHEN r.status = 'waiting' OR g.artifact_image_url IS NULL THEN NULL
        ELSE jsonb_build_object('imageUrl', g.artifact_image_url) END,
      'lastRoundReveal', CASE WHEN r.status = 'waiting' THEN NULL ELSE g.last_round_reveal END,
      'roundHistory', CASE WHEN r.status = 'waiting' THEN '[]'::jsonb
        WHEN jsonb_typeof(g.round_history::jsonb) = 'array' AND g.round_history::jsonb <> '[]'::jsonb THEN g.round_history::jsonb
        WHEN g.last_round_reveal IS NOT NULL AND g.last_round_reveal::jsonb <> 'null'::jsonb THEN jsonb_build_array(g.last_round_reveal)
        ELSE '[]'::jsonb END,
      'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) ORDER BY m.joined_at, m.id)
        FROM multiplayer_room_members m WHERE m.room_id = r.id AND m.left_at IS NULL), '[]'::jsonb),
      'players', CASE WHEN r.status = 'waiting' THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'memberId', m.id, 'name', m.name, 'health', r.max_health, 'isEliminated', false,
        'finalPlacement', NULL, 'cumulativeScore', 0, 'eliminationRound', NULL, 'hasGuessedThisRound', false
      ) ORDER BY m.joined_at, m.id) FROM multiplayer_room_members m WHERE m.room_id = r.id AND m.left_at IS NULL), '[]'::jsonb)
      ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'memberId', p.member_id, 'name', p.name, 'health', p.health,
        'isEliminated', p.is_eliminated, 'finalPlacement', p.final_placement,
        'cumulativeScore', p.cumulative_score, 'eliminationRound', p.elimination_round,
        'hasGuessedThisRound', EXISTS(SELECT 1 FROM multiplayer_guesses q
          WHERE q.game_id = g.id AND q.player_id = p.id AND q.round_number = g.current_round)
      ) ORDER BY p.created_at, p.id) FROM multiplayer_players p WHERE p.game_id = g.id), '[]'::jsonb) END
    ) AS snapshot
    FROM multiplayer_rooms r LEFT JOIN multiplayer_games g ON g.id = r.current_session_id
    WHERE r.id = ${roomId}::uuid
  `;
  if (!rows[0]) throw new GameSessionError('Room not found', 404);
  const snapshot = rows[0].snapshot;
  // Keep the existing ISO timestamp format across Prisma and JSON SQL reads.
  snapshot.serverTime = new Date(snapshot.serverTime).toISOString();
  for (const key of ['roundStartsAt', 'roundEndsAt', 'resultsRevealAt'] as const) {
    if (snapshot[key]) snapshot[key] = new Date(snapshot[key]).toISOString();
  }
  return snapshot;
}
