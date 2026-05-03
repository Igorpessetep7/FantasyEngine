ALTER TABLE player_characters
  ADD COLUMN IF NOT EXISTS event_variables JSONB NOT NULL DEFAULT '{}'::jsonb;