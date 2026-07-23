-- Additive inter-round synchronization timestamp. Null means the active round
-- is immediately playable (including the first round).
ALTER TABLE "multiplayer_games"
ADD COLUMN "round_starts_at" TIMESTAMPTZ(6);
