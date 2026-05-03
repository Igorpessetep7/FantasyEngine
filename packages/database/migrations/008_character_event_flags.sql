ALTER TABLE player_characters
  ADD COLUMN IF NOT EXISTS event_flags JSONB NOT NULL DEFAULT '{}'::jsonb;