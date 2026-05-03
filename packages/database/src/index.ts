import { Pool } from "pg";
import type { EntitySnapshot, ItemStack, PlayerProgress, QuestState } from "@fantasy-engine/protocol";

export interface CharacterState {
  player: EntitySnapshot;
  inventory: ItemStack[];
  progress: PlayerProgress;
  quests: QuestState[];
}

export interface CharacterRepository {
  readonly mode: "memory" | "postgres";
  initialize(): Promise<void>;
  loadOrCreate(clientId: string, defaults: CharacterState): Promise<CharacterState>;
  save(clientId: string, state: CharacterState): Promise<void>;
}

export function createCharacterRepository(): CharacterRepository {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    return new PostgresCharacterRepository(databaseUrl);
  }

  return new MemoryCharacterRepository();
}

class MemoryCharacterRepository implements CharacterRepository {
  readonly mode = "memory" as const;

  private readonly records = new Map<string, CharacterState>();

  async initialize(): Promise<void> {}

  async loadOrCreate(clientId: string, defaults: CharacterState): Promise<CharacterState> {
    const existing = this.records.get(clientId);

    if (!existing) {
      const created = cloneState(defaults);
      this.records.set(clientId, created);
      return cloneState(created);
    }

    return cloneState({
      player: { ...existing.player, id: defaults.player.id, name: defaults.player.name },
      inventory: existing.inventory,
      progress: existing.progress,
      quests: existing.quests,
    });
  }

  async save(clientId: string, state: CharacterState): Promise<void> {
    this.records.set(clientId, cloneState(state));
  }
}

class PostgresCharacterRepository implements CharacterRepository {
  readonly mode = "postgres" as const;

  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
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
          level INTEGER NOT NULL DEFAULT 1 CHECK (level > 0),
          xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
          xp_to_next INTEGER NOT NULL DEFAULT 50 CHECK (xp_to_next > 0),
          gold INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
          quests JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.pool.query(`
      ALTER TABLE player_characters
        ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1 CHECK (level > 0),
        ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
        ADD COLUMN IF NOT EXISTS xp_to_next INTEGER NOT NULL DEFAULT 50 CHECK (xp_to_next > 0),
        ADD COLUMN IF NOT EXISTS gold INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
        ADD COLUMN IF NOT EXISTS quests JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_player_characters_updated_at ON player_characters (updated_at);");
  }

  async loadOrCreate(clientId: string, defaults: CharacterState): Promise<CharacterState> {
    const existing = await this.pool.query<StoredCharacterRow>(
      "SELECT client_id, name, x, y, direction, hp, max_hp, inventory, level, xp, xp_to_next, gold, quests FROM player_characters WHERE client_id = $1",
      [clientId],
    );

    if (existing.rowCount && existing.rows[0]) {
      return rowToState(existing.rows[0], defaults.player.id, defaults.player.name);
    }

    await this.save(clientId, defaults);
    return cloneState(defaults);
  }

  async save(clientId: string, state: CharacterState): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO player_characters (client_id, name, map_id, x, y, direction, hp, max_hp, inventory, level, xp, xp_to_next, gold, quests, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14::jsonb, NOW())
        ON CONFLICT (client_id) DO UPDATE SET
          name = EXCLUDED.name,
          map_id = EXCLUDED.map_id,
          x = EXCLUDED.x,
          y = EXCLUDED.y,
          direction = EXCLUDED.direction,
          hp = EXCLUDED.hp,
          max_hp = EXCLUDED.max_hp,
          inventory = EXCLUDED.inventory,
          level = EXCLUDED.level,
          xp = EXCLUDED.xp,
          xp_to_next = EXCLUDED.xp_to_next,
          gold = EXCLUDED.gold,
          quests = EXCLUDED.quests,
          updated_at = NOW()
      `,
      [
        clientId,
        state.player.name,
        "starter-field",
        state.player.x,
        state.player.y,
        state.player.direction,
        state.player.hp,
        state.player.maxHp,
        JSON.stringify(state.inventory),
        state.progress.level,
        state.progress.xp,
        state.progress.xpToNext,
        state.progress.gold,
        JSON.stringify(state.quests),
      ],
    );
  }
}

interface StoredCharacterRow {
  client_id: string;
  name: string;
  x: number;
  y: number;
  direction: EntitySnapshot["direction"];
  hp: number;
  max_hp: number;
  inventory: ItemStack[];
  level: number;
  xp: number;
  xp_to_next: number;
  gold: number;
  quests: QuestState[];
}

function rowToState(row: StoredCharacterRow, runtimeEntityId: string, runtimeName: string): CharacterState {
  return {
    player: {
      id: runtimeEntityId,
      kind: "player",
      name: runtimeName || row.name,
      x: row.x,
      y: row.y,
      direction: row.direction,
      hp: row.hp,
      maxHp: row.max_hp,
    },
    inventory: Array.isArray(row.inventory) ? row.inventory : [],
    progress: {
      level: row.level,
      xp: row.xp,
      xpToNext: row.xp_to_next,
      gold: row.gold,
    },
    quests: Array.isArray(row.quests) ? row.quests : [],
  };
}

function cloneState(state: CharacterState): CharacterState {
  return {
    player: { ...state.player },
    inventory: state.inventory.map((item) => ({ ...item })),
    progress: { ...state.progress },
    quests: state.quests.map((quest) => ({
      ...quest,
      target: { ...quest.target },
      reward: { ...quest.reward, items: quest.reward.items.map((item) => ({ ...item })) },
    })),
  };
}