CREATE TABLE multiplayer_round_resolution_claims (
  session_id uuid NOT NULL REFERENCES multiplayer_games(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  claim_token uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (session_id, round_number)
);
