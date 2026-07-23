-- Additive, reconnect-safe storage for completed multiplayer round results.
ALTER TABLE "multiplayer_games"
ADD COLUMN "round_history" JSONB;
