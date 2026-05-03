ALTER TABLE player_characters
  ADD COLUMN IF NOT EXISTS quests JSONB NOT NULL DEFAULT '[]'::jsonb;