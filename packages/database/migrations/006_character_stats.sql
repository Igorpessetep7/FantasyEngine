ALTER TABLE player_characters
  ADD COLUMN IF NOT EXISTS stats JSONB NOT NULL DEFAULT '{"strength": 1, "intelligence": 1, "vitality": 1, "points": 0}'::jsonb;