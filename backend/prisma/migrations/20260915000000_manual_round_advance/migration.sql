ALTER TABLE multiplayer_rooms ADD COLUMN auto_advance_rounds BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE multiplayer_games ADD COLUMN awaiting_host BOOLEAN NOT NULL DEFAULT false;
