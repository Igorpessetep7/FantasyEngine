CREATE TABLE IF NOT EXISTS player_characters (
  client_id TEXT PRIMARY KEY,
  name VARCHAR(24) NOT NULL,
  map_id TEXT NOT NULL DEFAULT 'starter-field',
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down', 'left', 'right')),
  hp INTEGER NOT NULL CHECK (hp >= 0),
  max_hp INTEGER NOT NULL CHECK (max_hp > 0),
  inventory JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_characters_updated_at ON player_characters (updated_at);