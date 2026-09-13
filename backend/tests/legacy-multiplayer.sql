CREATE TABLE multiplayer_games (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status varchar(16) NOT NULL DEFAULT 'waiting',
 current_round integer NOT NULL DEFAULT 0, max_rounds integer NOT NULL DEFAULT 10,
 countdown_seconds integer NOT NULL DEFAULT 60, max_health integer NOT NULL DEFAULT 25000,
 object_id bigint, artifact_iso3 varchar(3), artifact_begin_year integer, artifact_end_year integer,
 artifact_image_url text, artifact_title text, round_ends_at timestamptz, round_starts_at timestamptz,
 last_round_reveal jsonb, round_history jsonb, revision integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE multiplayer_players (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game_id uuid NOT NULL REFERENCES multiplayer_games(id),
 name varchar(32) NOT NULL, health integer NOT NULL DEFAULT 25000, is_eliminated boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE multiplayer_guesses (
 id bigserial PRIMARY KEY, game_id uuid NOT NULL REFERENCES multiplayer_games(id),
 player_id uuid NOT NULL REFERENCES multiplayer_players(id), round_number integer NOT NULL,
 country_guessed varchar(3), year_guessed integer, distance_km double precision, years_away integer,
 score_country integer NOT NULL DEFAULT 0, score_year integer NOT NULL DEFAULT 0, total_score integer NOT NULL DEFAULT 0,
 submitted_at timestamptz NOT NULL DEFAULT now(), UNIQUE(game_id, player_id, round_number)
);
