import { Pool } from "pg";
import type { EntitySnapshot, EquipmentState, ItemStack, PlayerClass, PlayerProgress, PlayerStats, QuestState } from "@fantasy-engine/protocol";

export interface CharacterState {
  player: EntitySnapshot;
  inventory: ItemStack[];
  bank: ItemStack[];
  equipment: EquipmentState;
  progress: PlayerProgress;
  stats: PlayerStats;
  playerClass: PlayerClass | null;
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
      bank: existing.bank,
      equipment: existing.equipment,
      progress: existing.progress,
      stats: existing.stats,
      playerClass: existing.playerClass,
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
        bank JSONB NOT NULL DEFAULT '[]'::jsonb,
        equipment JSONB NOT NULL DEFAULT '{"weapon": null}'::jsonb,
        stats JSONB NOT NULL DEFAULT '{"strength": 1, "intelligence": 1, "vitality": 1, "points": 0}'::jsonb,
        player_class JSONB DEFAULT NULL,
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
        ADD COLUMN IF NOT EXISTS bank JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS equipment JSONB NOT NULL DEFAULT '{"weapon": null}'::jsonb,
        ADD COLUMN IF NOT EXISTS stats JSONB NOT NULL DEFAULT '{"strength": 1, "intelligence": 1, "vitality": 1, "points": 0}'::jsonb,
        ADD COLUMN IF NOT EXISTS player_class JSONB DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS quests JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_player_characters_updated_at ON player_characters (updated_at);");
  }

  async loadOrCreate(clientId: string, defaults: CharacterState): Promise<CharacterState> {
    const existing = await this.pool.query<StoredCharacterRow>(
      "SELECT client_id, name, x, y, direction, hp, max_hp, inventory, bank, equipment, stats, player_class, level, xp, xp_to_next, gold, quests FROM player_characters WHERE client_id = $1",
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
        INSERT INTO player_characters (client_id, name, map_id, x, y, direction, hp, max_hp, inventory, bank, equipment, stats, player_class, level, xp, xp_to_next, gold, quests, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, $17, $18::jsonb, NOW())
        ON CONFLICT (client_id) DO UPDATE SET
          name = EXCLUDED.name,
          map_id = EXCLUDED.map_id,
          x = EXCLUDED.x,
          y = EXCLUDED.y,
          direction = EXCLUDED.direction,
          hp = EXCLUDED.hp,
          max_hp = EXCLUDED.max_hp,
          inventory = EXCLUDED.inventory,
          bank = EXCLUDED.bank,
          equipment = EXCLUDED.equipment,
          stats = EXCLUDED.stats,
          player_class = EXCLUDED.player_class,
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
        JSON.stringify(state.bank),
        JSON.stringify(state.equipment),
        JSON.stringify(state.stats),
        JSON.stringify(state.playerClass),
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
  bank: ItemStack[];
  equipment: EquipmentState;
  stats: PlayerStats;
  player_class: PlayerClass | null;
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
      npcDefinitionId: null,
      disposition: null,
      name: runtimeName || row.name,
      x: row.x,
      y: row.y,
      direction: row.direction,
      hp: row.hp,
      maxHp: row.max_hp,
    },
    inventory: Array.isArray(row.inventory) ? row.inventory : [],
    bank: Array.isArray(row.bank) ? row.bank : [],
    equipment: normalizeEquipment(row.equipment),
    stats: normalizeStats(row.stats),
    playerClass: normalizePlayerClass(row.player_class),
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
    player: { ...state.player, npcDefinitionId: state.player.npcDefinitionId ?? null, disposition: state.player.disposition ?? null },
    inventory: state.inventory.map((item) => ({ ...item })),
    bank: state.bank.map((item) => ({ ...item })),
    equipment: normalizeEquipment(state.equipment),
    stats: normalizeStats(state.stats),
    playerClass: normalizePlayerClass(state.playerClass),
    progress: { ...state.progress },
    quests: state.quests.map((quest) => ({
      ...quest,
      target: { ...quest.target },
      reward: { ...quest.reward, items: quest.reward.items.map((item) => ({ ...item })) },
    })),
  };
}

function normalizeEquipment(equipment: EquipmentState | undefined): EquipmentState {
  return {
    weapon: equipment?.weapon ? { ...equipment.weapon, item: { ...equipment.weapon.item } } : null,
  };
}

function normalizeStats(stats: PlayerStats | undefined): PlayerStats {
  return {
    strength: stats?.strength ?? 1,
    intelligence: stats?.intelligence ?? 1,
    vitality: stats?.vitality ?? 1,
    points: stats?.points ?? 0,
  };
}

function normalizePlayerClass(playerClass: PlayerClass | null | undefined): PlayerClass | null {
  if (!playerClass) {
    return null;
  }

  return {
    ...playerClass,
    statBonuses: { ...playerClass.statBonuses },
  };
}