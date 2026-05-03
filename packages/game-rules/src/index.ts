import { isBlocked } from "@fantasy-engine/map-format";
import type { Direction, EntitySnapshot, ItemStack, MapItemSnapshot, MapSnapshot, PlayerProgress, QuestState, ShopOffer, SpellDefinition } from "@fantasy-engine/protocol";

export interface MoveResult {
  moved: boolean;
  entity: EntitySnapshot;
}

export interface AttackResult {
  hit: boolean;
  defeated: boolean;
  attacker: EntitySnapshot;
  target: EntitySnapshot;
  damage: number;
}

export function createPlayer(id: string, name: string): EntitySnapshot {
  return {
    id,
    kind: "player",
    name,
    x: 4,
    y: 4,
    direction: "down",
    hp: 100,
    maxHp: 100,
  };
}

export function createNpc(id: string, name: string, x: number, y: number): EntitySnapshot {
  return {
    id,
    kind: "npc",
    name,
    x,
    y,
    direction: "down",
    hp: 35,
    maxHp: 35,
  };
}

export function applyMoveIntent(entity: EntitySnapshot, direction: Direction, map: MapSnapshot): MoveResult {
  const delta = directionToDelta(direction);
  const next = {
    ...entity,
    direction,
    x: entity.x + delta.x,
    y: entity.y + delta.y,
  };

  if (isBlocked(map, next.x, next.y)) {
    return {
      moved: false,
      entity: { ...entity, direction },
    };
  }

  return {
    moved: true,
    entity: next,
  };
}

export function applyAttackIntent(attacker: EntitySnapshot, targets: EntitySnapshot[]): AttackResult | undefined {
  const target = targets.find((candidate) => candidate.hp > 0 && isFacingAdjacent(attacker, candidate));

  if (!target) {
    return undefined;
  }

  const damage = attacker.kind === "player" ? 9 : 5;
  const nextTarget = {
    ...target,
    hp: Math.max(0, target.hp - damage),
  };

  return {
    hit: true,
    defeated: nextTarget.hp === 0,
    attacker,
    target: nextTarget,
    damage,
  };
}

function directionToDelta(direction: Direction): { x: number; y: number } {
  switch (direction) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
  }
}

function isFacingAdjacent(attacker: EntitySnapshot, target: EntitySnapshot): boolean {
  const delta = directionToDelta(attacker.direction);

  return attacker.x + delta.x === target.x && attacker.y + delta.y === target.y;
}

export function canPickupItem(entity: EntitySnapshot, item: MapItemSnapshot): boolean {
  const distance = Math.abs(entity.x - item.x) + Math.abs(entity.y - item.y);

  return distance <= 1;
}

export interface ProgressAward {
  progress: PlayerProgress;
  leveledUp: boolean;
  xpGained: number;
  goldGained: number;
}

export function createInitialProgress(): PlayerProgress {
  return {
    level: 1,
    xp: 0,
    xpToNext: getXpToNextLevel(1),
    gold: 0,
  };
}

export function awardNpcDefeat(progress: PlayerProgress, npc: EntitySnapshot): ProgressAward {
  const xpGained = npc.name === "Guardiao" ? 35 : 14;
  const goldGained = npc.name === "Guardiao" ? 8 : 3;
  let level = progress.level;
  let xp = progress.xp + xpGained;
  let xpToNext = getXpToNextLevel(level);
  let leveledUp = false;

  while (xp >= xpToNext) {
    xp -= xpToNext;
    level += 1;
    xpToNext = getXpToNextLevel(level);
    leveledUp = true;
  }

  return {
    progress: {
      level,
      xp,
      xpToNext,
      gold: progress.gold + goldGained,
    },
    leveledUp,
    xpGained,
    goldGained,
  };
}

export function createInitialQuests(): QuestState[] {
  return [
    {
      questId: "first-slimes",
      title: "Limpeza do Campo",
      description: "Derrote Slimes no campo inicial.",
      target: {
        kind: "defeatNpc",
        npcName: "Slime",
        required: 3,
      },
      progress: 0,
      status: "active",
      reward: {
        xp: 25,
        gold: 10,
        items: [{ itemId: "small-potion", name: "Pocao Pequena", quantity: 1 }],
      },
    },
  ];
}

export function applyQuestNpcDefeat(quests: QuestState[], npc: EntitySnapshot): { quests: QuestState[]; completed: QuestState[] } {
  const completed: QuestState[] = [];
  const nextQuests = quests.map((quest) => {
    if (quest.status !== "active" || quest.target.npcName !== npc.name) {
      return quest;
    }

    const progress = Math.min(quest.target.required, quest.progress + 1);
    const status = progress >= quest.target.required ? "completed" : "active";
    const nextQuest = { ...quest, progress, status } satisfies QuestState;

    if (status === "completed") {
      completed.push(nextQuest);
    }

    return nextQuest;
  });

  return { quests: nextQuests, completed };
}

export function claimCompletedQuestRewards(progress: PlayerProgress, inventory: ItemStack[], quests: QuestState[]): { progress: PlayerProgress; inventory: ItemStack[]; quests: QuestState[]; claimed: QuestState[] } {
  let nextProgress = progress;
  const nextInventory = inventory.map((item) => ({ ...item }));
  const claimed: QuestState[] = [];
  const nextQuests = quests.map((quest) => {
    if (quest.status !== "completed") {
      return quest;
    }

    nextProgress = addRewardProgress(nextProgress, quest.reward.xp, quest.reward.gold);

    for (const rewardItem of quest.reward.items) {
      const existing = nextInventory.find((item) => item.itemId === rewardItem.itemId);

      if (existing) {
        existing.quantity += rewardItem.quantity;
      } else {
        nextInventory.push({ ...rewardItem });
      }
    }

    const claimedQuest = { ...quest, status: "claimed" as const };
    claimed.push(claimedQuest);
    return claimedQuest;
  });

  return { progress: nextProgress, inventory: nextInventory, quests: nextQuests, claimed };
}

function getXpToNextLevel(level: number): number {
  return 50 + (level - 1) * 30;
}

function addRewardProgress(progress: PlayerProgress, xpGained: number, goldGained: number): PlayerProgress {
  let level = progress.level;
  let xp = progress.xp + xpGained;
  let xpToNext = getXpToNextLevel(level);

  while (xp >= xpToNext) {
    xp -= xpToNext;
    level += 1;
    xpToNext = getXpToNextLevel(level);
  }

  return {
    level,
    xp,
    xpToNext,
    gold: progress.gold + goldGained,
  };
}

export interface PurchaseResult {
  ok: boolean;
  progress: PlayerProgress;
  item?: ItemStack;
  error?: "unknown_item" | "not_enough_gold";
}

export const starterShopOffers: ShopOffer[] = [
  {
    item: { itemId: "small-potion", name: "Pocao Pequena", quantity: 1 },
    priceGold: 2,
  },
  {
    item: { itemId: "training-scroll", name: "Pergaminho de Treino", quantity: 1 },
    priceGold: 6,
  },
];

export function applyPurchaseIntent(progress: PlayerProgress, itemId: string): PurchaseResult {
  const offer = starterShopOffers.find((candidate) => candidate.item.itemId === itemId);

  if (!offer) {
    return {
      ok: false,
      progress,
      error: "unknown_item",
    };
  }

  if (progress.gold < offer.priceGold) {
    return {
      ok: false,
      progress,
      error: "not_enough_gold",
    };
  }

  return {
    ok: true,
    progress: {
      ...progress,
      gold: progress.gold - offer.priceGold,
    },
    item: { ...offer.item },
  };
}

export interface ItemUseResult {
  ok: boolean;
  entity: EntitySnapshot;
  consumed: boolean;
  message?: string;
  error?: "unknown_item" | "not_usable" | "already_full";
}

export function applyItemUseIntent(entity: EntitySnapshot, itemId: string): ItemUseResult {
  if (itemId !== "small-potion") {
    return {
      ok: false,
      entity,
      consumed: false,
      error: itemId === "training-scroll" ? "not_usable" : "unknown_item",
    };
  }

  if (entity.hp >= entity.maxHp) {
    return {
      ok: false,
      entity,
      consumed: false,
      error: "already_full",
    };
  }

  const healed = Math.min(entity.maxHp - entity.hp, 30);

  return {
    ok: true,
    entity: {
      ...entity,
      hp: entity.hp + healed,
    },
    consumed: true,
    message: `curou ${healed} HP`,
  };
}

export interface SpellCastResult {
  spell: SpellDefinition;
  target: EntitySnapshot;
  damage: number;
  defeated: boolean;
}

export const starterSpells: SpellDefinition[] = [
  {
    spellId: "fire-bolt",
    name: "Fire Bolt",
    description: "Dispara uma chama em linha reta.",
    range: 5,
    damage: 16,
    cooldownMs: 1200,
  },
];

export function applySpellCastIntent(attacker: EntitySnapshot, spellId: string, targets: EntitySnapshot[], map: MapSnapshot): SpellCastResult | undefined {
  const spell = starterSpells.find((candidate) => candidate.spellId === spellId);

  if (!spell) {
    return undefined;
  }

  const delta = directionToDelta(attacker.direction);

  for (let distance = 1; distance <= spell.range; distance += 1) {
    const x = attacker.x + delta.x * distance;
    const y = attacker.y + delta.y * distance;

    if (isBlocked(map, x, y)) {
      return undefined;
    }

    const target = targets.find((candidate) => candidate.hp > 0 && candidate.x === x && candidate.y === y);

    if (target) {
      const nextTarget = {
        ...target,
        hp: Math.max(0, target.hp - spell.damage),
      };

      return {
        spell,
        target: nextTarget,
        damage: spell.damage,
        defeated: nextTarget.hp === 0,
      };
    }
  }

  return undefined;
}