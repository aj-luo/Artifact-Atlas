-- Additive synchronization version. Every multiplayer mutation increments this
-- value so clients can reject stale snapshots and this row can be the sole
-- Realtime postgres_changes invalidation source.
ALTER TABLE "multiplayer_games"
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
