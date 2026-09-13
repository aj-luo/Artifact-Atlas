-- Additive: existing games, guesses, and round JSON remain intact.
-- Keep schema changes and the legacy backfill atomic.
BEGIN;
CREATE TABLE multiplayer_rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status varchar(16) NOT NULL DEFAULT 'waiting',
 host_member_id uuid, current_session_id uuid UNIQUE, revision integer NOT NULL DEFAULT 0,
 session_count integer NOT NULL DEFAULT 0, max_rounds integer NOT NULL DEFAULT 10,
 max_health integer NOT NULL DEFAULT 25000, countdown_seconds integer NOT NULL DEFAULT 60,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE multiplayer_room_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES multiplayer_rooms(id),
 name varchar(32) NOT NULL, credential_hash varchar(64) UNIQUE,
 joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz
);
CREATE INDEX multiplayer_room_members_room_id_left_at_joined_at_idx ON multiplayer_room_members(room_id, left_at, joined_at);
ALTER TABLE multiplayer_games ADD COLUMN room_id uuid REFERENCES multiplayer_rooms(id),
 ADD COLUMN session_number integer, ADD COLUMN completed_at timestamptz;
CREATE UNIQUE INDEX multiplayer_games_room_id_session_number_key ON multiplayer_games(room_id, session_number);
ALTER TABLE multiplayer_players ADD COLUMN member_id uuid REFERENCES multiplayer_room_members(id),
 ADD COLUMN final_placement integer, ADD COLUMN elimination_round integer,
 ADD COLUMN cumulative_score integer NOT NULL DEFAULT 0, ADD COLUMN completed_at timestamptz;
CREATE UNIQUE INDEX multiplayer_players_game_id_member_id_key ON multiplayer_players(game_id, member_id);
INSERT INTO multiplayer_rooms(id, status, current_session_id, revision, session_count, max_rounds, max_health, countdown_seconds, created_at)
 SELECT id, status, id, revision, 1, max_rounds, max_health, countdown_seconds, created_at FROM multiplayer_games;
INSERT INTO multiplayer_room_members(id, room_id, name, joined_at)
 SELECT id, game_id, name, created_at FROM multiplayer_players;
UPDATE multiplayer_games SET room_id = id, session_number = 1,
 completed_at = CASE WHEN status = 'finished' THEN updated_at END;
UPDATE multiplayer_players p SET member_id = p.id,
 cumulative_score = COALESCE((SELECT sum(total_score) FROM multiplayer_guesses g WHERE g.player_id = p.id AND (SELECT status = 'finished' OR g.round_number < current_round FROM multiplayer_games WHERE id = p.game_id)), 0),
 completed_at = g.completed_at FROM multiplayer_games g WHERE p.game_id = g.id;
UPDATE multiplayer_rooms r SET host_member_id = (
 SELECT id FROM multiplayer_room_members WHERE room_id = r.id ORDER BY joined_at, id LIMIT 1
);
ALTER TABLE multiplayer_rooms ADD FOREIGN KEY (host_member_id) REFERENCES multiplayer_room_members(id),
 ADD FOREIGN KEY (current_session_id) REFERENCES multiplayer_games(id);
-- Only reconstruct survival order when every round and participant is present.
WITH reliable AS (
 SELECT g.id FROM multiplayer_games g WHERE g.status = 'finished' AND g.current_round > 0
 AND NOT EXISTS (
   SELECT 1 FROM generate_series(1, g.current_round) n
   CROSS JOIN multiplayer_players p
   WHERE p.game_id = g.id AND NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(g.round_history) = 'array' THEN g.round_history ELSE '[]'::jsonb END) r,
     jsonb_array_elements(r->'guesses') q
     WHERE (r->>'round')::int = n AND q->>'playerId' = p.id::text
       AND jsonb_typeof(q->'isEliminated') = 'boolean'
   )
 )
), eliminations AS (
 SELECT p.id, min((r->>'round')::int) FILTER (WHERE q->>'isEliminated' = 'true') AS round
 FROM multiplayer_players p JOIN multiplayer_games g ON g.id = p.game_id JOIN reliable ON reliable.id = g.id,
 jsonb_array_elements(g.round_history) r, jsonb_array_elements(r->'guesses') q
 WHERE q->>'playerId' = p.id::text GROUP BY p.id
)
UPDATE multiplayer_players p SET elimination_round = e.round FROM eliminations e WHERE e.id = p.id;
-- If any eliminated player has unknown order, the session's placements stay unavailable.
WITH ranked AS (
 SELECT p.id, rank() OVER (PARTITION BY p.game_id ORDER BY p.is_eliminated ASC,
 CASE WHEN p.is_eliminated THEN p.elimination_round ELSE NULL END DESC NULLS LAST,
 p.health DESC, p.cumulative_score DESC) AS place
 FROM multiplayer_players p JOIN multiplayer_games g ON g.id = p.game_id
 WHERE g.status = 'finished' AND NOT EXISTS (
   SELECT 1 FROM multiplayer_players missing WHERE missing.game_id = g.id
   AND missing.is_eliminated AND missing.elimination_round IS NULL
 )
)
UPDATE multiplayer_players p SET final_placement = ranked.place FROM ranked WHERE ranked.id = p.id;
-- Every session mutation invalidates the room, including guesses and timer resolution.
CREATE FUNCTION multiplayer_bump_room_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE multiplayer_rooms SET revision = revision + 1,
 status = CASE WHEN NEW.status = 'finished' THEN 'finished' ELSE status END
 WHERE id = NEW.room_id AND current_session_id = NEW.id;
 RETURN NEW;
END $$;
CREATE TRIGGER multiplayer_session_revision AFTER UPDATE ON multiplayer_games
 FOR EACH ROW EXECUTE FUNCTION multiplayer_bump_room_revision();
-- Credentials are only read by the server. Public room updates contain no secrets.
ALTER TABLE multiplayer_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE multiplayer_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY multiplayer_rooms_read ON multiplayer_rooms FOR SELECT USING (true);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
   ALTER PUBLICATION supabase_realtime ADD TABLE multiplayer_rooms;
 END IF;
END $$;

COMMIT;
