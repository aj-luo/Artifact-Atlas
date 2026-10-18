-- Private preparation state; deliberately excluded from snapshots and Realtime.
CREATE TABLE multiplayer_artifact_reservations (
  session_id uuid NOT NULL REFERENCES multiplayer_games(id) ON DELETE CASCADE ON UPDATE CASCADE,
  round_number integer NOT NULL CHECK (round_number > 1),
  claim_token uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  artifact jsonb,
  PRIMARY KEY (session_id, round_number)
);
ALTER TABLE multiplayer_artifact_reservations ENABLE ROW LEVEL SECURITY;
