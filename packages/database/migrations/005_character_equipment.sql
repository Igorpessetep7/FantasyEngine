ALTER TABLE player_characters
  ADD COLUMN IF NOT EXISTS equipment JSONB NOT NULL DEFAULT '{"weapon": null}'::jsonb;