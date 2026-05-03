import { isBlocked } from "@fantasy-engine/map-format";
import type { ClassId, CraftingRecipe, Direction, EntitySnapshot, EquipmentSlot, EquipmentState, EquippedItem, ItemStack, MapItemSnapshot, MapSnapshot, NpcDialogue, NpcDisposition, PlayerClass, PlayerEventFlags, PlayerEventVariables, PlayerProgress, PlayerStats, QuestState, ResourceSnapshot, ShopOffer, SpellDefinition, StatName } from "@fantasy-engine/protocol";

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
    npcDefinitionId: null,
    disposition: null,
    name,
    x: 4,
    y: 4,
    direction: "down",
    hp: 100,
    maxHp: 100,
  };
}

export interface NpcDefinition {
  npcDefinitionId: string;
  name: string;
  disposition: NpcDisposition;
  maxHp: number;
  attackDamage: number;
  xpReward: number;
  goldReward: number;
  respawnMs: number;
  loot: ItemStack[];
  dialogue: string[];
}

export const starterNpcDefinitions: Record<string, NpcDefinition> = {
  slime: {
    npcDefinitionId: "slime",
    name: "Slime",
    disposition: "hostile",
    maxHp: 35,
    attackDamage: 4,
    xpReward: 14,
    goldReward: 3,
    respawnMs: 5000,
    loot: [{ itemId: "slime-gel", name: "Gel de Slime", quantity: 1 }],
    dialogue: [],
  },
  guard: {
    npcDefinitionId: "guard",
    name: "Guardiao",
    disposition: "hostile",
    maxHp: 55,
    attackDamage: 8,
    xpReward: 35,
    goldReward: 8,
    respawnMs: 7000,
    loot: [{ itemId: "iron-token", name: "Ficha de Ferro", quantity: 2 }],
    dialogue: [],
  },
  guide: {
    npcDefinitionId: "guide",
    name: "Guia",
    disposition: "friendly",
    maxHp: 100,
    attackDamage: 0,
    xpReward: 0,
    goldReward: 0,
    respawnMs: 0,
    loot: [],
    dialogue: ["Bem-vindo ao campo inicial. Escolha uma classe, treine contra Slimes e guarde seus itens importantes no banco."],
  },
};

export function createNpc(id: string, npcDefinitionId: string, x: number, y: number): EntitySnapshot {
  const definition = getNpcDefinitionById(npcDefinitionId);

  return {
    id,
    kind: "npc",
    npcDefinitionId: definition.npcDefinitionId,
    disposition: definition.disposition,
    name: definition.name,
    x,
    y,
    direction: "down",
    hp: definition.maxHp,
    maxHp: definition.maxHp,
  };
}

export function createResource(id: string, kind: ResourceSnapshot["kind"], x: number, y: number): ResourceSnapshot {
  return {
    id,
    kind,
    name: kind === "tree" ? "Arvore" : "Veio de Ferro",
    x,
    y,
    hp: kind === "tree" ? 3 : 4,
    maxHp: kind === "tree" ? 3 : 4,
    depleted: false,
  };
}

export function createInitialEquipment(): EquipmentState {
  return {
    weapon: null,
  };
}

export function createInitialEventFlags(): PlayerEventFlags {
  return {};
}

export function createInitialEventVariables(): PlayerEventVariables {
  return {};
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

export function applyAttackIntent(attacker: EntitySnapshot, targets: EntitySnapshot[], attackBonus = 0): AttackResult | undefined {
  const target = targets.find((candidate) => candidate.hp > 0 && isHostileTarget(candidate) && isFacingAdjacent(attacker, candidate));

  if (!target) {
    return undefined;
  }

  const damage = attacker.kind === "player" ? 9 + attackBonus : 5;
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

export interface ResourceGatherResult {
  ok: boolean;
  resource: ResourceSnapshot;
  item?: ItemStack;
  depleted: boolean;
  error?: "out_of_range" | "depleted";
}

export function applyResourceGatherIntent(entity: EntitySnapshot, resource: ResourceSnapshot): ResourceGatherResult {
  const distance = Math.abs(entity.x - resource.x) + Math.abs(entity.y - resource.y);

  if (distance > 1) {
    return {
      ok: false,
      resource,
      depleted: resource.depleted,
      error: "out_of_range",
    };
  }

  if (resource.depleted || resource.hp <= 0) {
    return {
      ok: false,
      resource,
      depleted: true,
      error: "depleted",
    };
  }

  const nextHp = Math.max(0, resource.hp - 1);
  const nextResource = {
    ...resource,
    hp: nextHp,
    depleted: nextHp === 0,
  };

  return {
    ok: true,
    resource: nextResource,
    item: resource.kind === "tree" ? { itemId: "wood-log", name: "Madeira", quantity: 1 } : { itemId: "iron-ore", name: "Minerio de Ferro", quantity: 1 },
    depleted: nextResource.depleted,
  };
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
  const definition = getNpcDefinitionForEntity(npc);
  const xpGained = definition?.xpReward ?? 0;
  const goldGained = definition?.goldReward ?? 0;
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

export function getNpcDefinitionForEntity(npc: EntitySnapshot): NpcDefinition | undefined {
  if (npc.kind !== "npc" || !npc.npcDefinitionId) {
    return undefined;
  }

  return starterNpcDefinitions[npc.npcDefinitionId];
}

export function getNpcLoot(npc: EntitySnapshot): ItemStack[] {
  return getNpcDefinitionForEntity(npc)?.loot.map((item) => ({ ...item })) ?? [];
}

export function getNpcAttackDamage(npc: EntitySnapshot): number {
  return getNpcDefinitionForEntity(npc)?.attackDamage ?? 0;
}

export function getNpcRespawnMs(npc: EntitySnapshot): number {
  return getNpcDefinitionForEntity(npc)?.respawnMs ?? 0;
}

function getNpcDefinitionById(npcDefinitionId: string): NpcDefinition {
  const definition = starterNpcDefinitions[npcDefinitionId];

  if (!definition) {
    throw new Error(`NPC definition ${npcDefinitionId} nao encontrada.`);
  }

  return definition;
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

export function awardEventProgress(progress: PlayerProgress, xpGained: number, goldGained: number): ProgressAward {
  const nextProgress = addRewardProgress(progress, xpGained, goldGained);

  return {
    progress: nextProgress,
    leveledUp: nextProgress.level > progress.level,
    xpGained,
    goldGained,
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

export interface BankTransferResult {
  ok: boolean;
  inventory: ItemStack[];
  bank: ItemStack[];
  item?: ItemStack;
  error?: "missing_item" | "invalid_quantity";
}

export function applyBankDepositIntent(inventory: ItemStack[], bank: ItemStack[], itemId: string, quantity: number): BankTransferResult {
  return transferStack(inventory, bank, itemId, quantity);
}

export function applyBankWithdrawIntent(inventory: ItemStack[], bank: ItemStack[], itemId: string, quantity: number): BankTransferResult {
  const result = transferStack(bank, inventory, itemId, quantity);

  const nextResult: BankTransferResult = {
    ok: result.ok,
    inventory: result.bank,
    bank: result.inventory,
  };

  if (result.item) {
    nextResult.item = result.item;
  }

  if (result.error) {
    nextResult.error = result.error;
  }

  return nextResult;
}

function transferStack(source: ItemStack[], target: ItemStack[], itemId: string, quantity: number): BankTransferResult {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return {
      ok: false,
      inventory: cloneStacks(source),
      bank: cloneStacks(target),
      error: "invalid_quantity",
    };
  }

  const nextSource = cloneStacks(source);
  const nextTarget = cloneStacks(target);
  const sourceItem = nextSource.find((item) => item.itemId === itemId);

  if (!sourceItem) {
    return {
      ok: false,
      inventory: nextSource,
      bank: nextTarget,
      error: "missing_item",
    };
  }

  if (sourceItem.quantity < quantity) {
    return {
      ok: false,
      inventory: nextSource,
      bank: nextTarget,
      error: "invalid_quantity",
    };
  }

  const moved = { itemId: sourceItem.itemId, name: sourceItem.name, quantity };
  sourceItem.quantity -= quantity;

  if (sourceItem.quantity === 0) {
    nextSource.splice(nextSource.indexOf(sourceItem), 1);
  }

  const targetItem = nextTarget.find((item) => item.itemId === itemId);

  if (targetItem) {
    targetItem.quantity += quantity;
  } else {
    nextTarget.push({ ...moved });
  }

  return {
    ok: true,
    inventory: nextSource,
    bank: nextTarget,
    item: moved,
  };
}

function cloneStacks(stacks: ItemStack[]): ItemStack[] {
  return stacks.map((item) => ({ ...item }));
}

export interface CraftResult {
  ok: boolean;
  inventory: ItemStack[];
  recipe?: CraftingRecipe;
  output?: ItemStack;
  error?: "unknown_recipe" | "missing_ingredients";
}

export const starterCraftingRecipes: CraftingRecipe[] = [
  {
    recipeId: "small-potion-from-slime",
    name: "Pocao Pequena",
    description: "Mistura Gel de Slime com Madeira para criar uma pocao simples.",
    ingredients: [
      { itemId: "slime-gel", name: "Gel de Slime", quantity: 1 },
      { itemId: "wood-log", name: "Madeira", quantity: 1 },
    ],
    output: { itemId: "small-potion", name: "Pocao Pequena", quantity: 1 },
  },
  {
    recipeId: "training-scroll-from-ore",
    name: "Pergaminho de Treino",
    description: "Usa minerio e madeira como material de treino inicial.",
    ingredients: [
      { itemId: "iron-ore", name: "Minerio de Ferro", quantity: 1 },
      { itemId: "wood-log", name: "Madeira", quantity: 2 },
    ],
    output: { itemId: "training-scroll", name: "Pergaminho de Treino", quantity: 1 },
  },
  {
    recipeId: "training-sword-from-ore",
    name: "Espada de Treino",
    description: "Forja uma arma inicial para aumentar o dano fisico.",
    ingredients: [
      { itemId: "iron-ore", name: "Minerio de Ferro", quantity: 2 },
      { itemId: "wood-log", name: "Madeira", quantity: 1 },
    ],
    output: { itemId: "training-sword", name: "Espada de Treino", quantity: 1 },
  },
];

export function applyCraftIntent(inventory: ItemStack[], recipeId: string): CraftResult {
  const recipe = starterCraftingRecipes.find((candidate) => candidate.recipeId === recipeId);

  if (!recipe) {
    return {
      ok: false,
      inventory: cloneStacks(inventory),
      error: "unknown_recipe",
    };
  }

  const nextInventory = cloneStacks(inventory);

  for (const ingredient of recipe.ingredients) {
    const existing = nextInventory.find((item) => item.itemId === ingredient.itemId);

    if (!existing || existing.quantity < ingredient.quantity) {
      return {
        ok: false,
        inventory: nextInventory,
        recipe,
        error: "missing_ingredients",
      };
    }
  }

  for (const ingredient of recipe.ingredients) {
    removeStackQuantity(nextInventory, ingredient.itemId, ingredient.quantity);
  }

  addStackQuantity(nextInventory, recipe.output);

  return {
    ok: true,
    inventory: nextInventory,
    recipe,
    output: { ...recipe.output },
  };
}

function removeStackQuantity(inventory: ItemStack[], itemId: string, quantity: number): void {
  const existing = inventory.find((item) => item.itemId === itemId);

  if (!existing) {
    return;
  }

  existing.quantity -= quantity;

  if (existing.quantity <= 0) {
    inventory.splice(inventory.indexOf(existing), 1);
  }
}

function addStackQuantity(inventory: ItemStack[], item: ItemStack): void {
  const existing = inventory.find((stack) => stack.itemId === item.itemId);

  if (existing) {
    existing.quantity += item.quantity;
    return;
  }

  inventory.push({ ...item });
}

export interface EquipmentResult {
  ok: boolean;
  inventory: ItemStack[];
  equipment: EquipmentState;
  item?: EquippedItem;
  error?: "missing_item" | "not_equippable" | "empty_slot";
}

const equippableItems: Record<string, Omit<EquippedItem, "item"> & { name: string }> = {
  "training-sword": {
    slot: "weapon",
    name: "Espada de Treino",
    attackBonus: 4,
  },
};

export function applyEquipItemIntent(inventory: ItemStack[], equipment: EquipmentState, itemId: string): EquipmentResult {
  const itemDefinition = equippableItems[itemId];
  const nextInventory = cloneStacks(inventory);
  const nextEquipment = cloneEquipment(equipment);

  if (!itemDefinition) {
    return {
      ok: false,
      inventory: nextInventory,
      equipment: nextEquipment,
      error: "not_equippable",
    };
  }

  const inventoryItem = nextInventory.find((item) => item.itemId === itemId && item.quantity > 0);

  if (!inventoryItem) {
    return {
      ok: false,
      inventory: nextInventory,
      equipment: nextEquipment,
      error: "missing_item",
    };
  }

  removeStackQuantity(nextInventory, itemId, 1);

  const equippedItem: EquippedItem = {
    slot: itemDefinition.slot,
    item: { itemId, name: inventoryItem.name || itemDefinition.name, quantity: 1 },
    attackBonus: itemDefinition.attackBonus,
  };

  const previousItem = nextEquipment[itemDefinition.slot];

  if (previousItem) {
    addStackQuantity(nextInventory, previousItem.item);
  }

  nextEquipment[itemDefinition.slot] = equippedItem;

  return {
    ok: true,
    inventory: nextInventory,
    equipment: nextEquipment,
    item: equippedItem,
  };
}

export function applyUnequipItemIntent(inventory: ItemStack[], equipment: EquipmentState, slot: EquipmentSlot): EquipmentResult {
  const nextInventory = cloneStacks(inventory);
  const nextEquipment = cloneEquipment(equipment);
  const equippedItem = nextEquipment[slot];

  if (!equippedItem) {
    return {
      ok: false,
      inventory: nextInventory,
      equipment: nextEquipment,
      error: "empty_slot",
    };
  }

  addStackQuantity(nextInventory, equippedItem.item);
  nextEquipment[slot] = null;

  return {
    ok: true,
    inventory: nextInventory,
    equipment: nextEquipment,
    item: equippedItem,
  };
}

export function getEquipmentAttackBonus(equipment: EquipmentState): number {
  return equipment.weapon?.attackBonus ?? 0;
}

function cloneEquipment(equipment: EquipmentState): EquipmentState {
  return {
    weapon: equipment.weapon ? { ...equipment.weapon, item: { ...equipment.weapon.item } } : null,
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

export function applySpellCastIntent(attacker: EntitySnapshot, spellId: string, targets: EntitySnapshot[], map: MapSnapshot, damageBonus = 0): SpellCastResult | undefined {
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

    const target = targets.find((candidate) => candidate.hp > 0 && isHostileTarget(candidate) && candidate.x === x && candidate.y === y);

    if (target) {
      const nextTarget = {
        ...target,
        hp: Math.max(0, target.hp - spell.damage - damageBonus),
      };

      return {
        spell,
        target: nextTarget,
        damage: spell.damage + damageBonus,
        defeated: nextTarget.hp === 0,
      };
    }
  }

  return undefined;
}

export function createInitialStats(): PlayerStats {
  return {
    strength: 1,
    intelligence: 1,
    vitality: 1,
    points: 0,
  };
}

export const starterClasses: PlayerClass[] = [
  {
    classId: "warrior",
    name: "Guerreiro",
    description: "Linha de frente com mais forca e vitalidade.",
    statBonuses: {
      strength: 2,
      intelligence: 0,
      vitality: 1,
    },
  },
  {
    classId: "mage",
    name: "Mago",
    description: "Conjurador inicial com mais inteligencia.",
    statBonuses: {
      strength: 0,
      intelligence: 3,
      vitality: 0,
    },
  },
  {
    classId: "ranger",
    name: "Arqueiro",
    description: "Combatente flexivel com dano fisico e algum folego.",
    statBonuses: {
      strength: 1,
      intelligence: 1,
      vitality: 1,
    },
  },
];

export interface ClassChoiceResult {
  ok: boolean;
  entity: EntitySnapshot;
  stats: PlayerStats;
  playerClass?: PlayerClass;
  error?: "already_chosen" | "unknown_class";
}

export function applyClassChoiceIntent(entity: EntitySnapshot, stats: PlayerStats, currentClass: PlayerClass | null, classId: ClassId): ClassChoiceResult {
  if (currentClass) {
    return {
      ok: false,
      entity,
      stats: { ...stats },
      error: "already_chosen",
    };
  }

  const playerClass = starterClasses.find((candidate) => candidate.classId === classId);

  if (!playerClass) {
    return {
      ok: false,
      entity,
      stats: { ...stats },
      error: "unknown_class",
    };
  }

  const nextStats: PlayerStats = {
    ...stats,
    strength: stats.strength + playerClass.statBonuses.strength,
    intelligence: stats.intelligence + playerClass.statBonuses.intelligence,
    vitality: stats.vitality + playerClass.statBonuses.vitality,
  };
  const vitalityHp = playerClass.statBonuses.vitality * 10;

  return {
    ok: true,
    entity: {
      ...entity,
      hp: entity.hp + vitalityHp,
      maxHp: entity.maxHp + vitalityHp,
    },
    stats: nextStats,
    playerClass,
  };
}

export interface StatAllocationResult {
  ok: boolean;
  entity: EntitySnapshot;
  stats: PlayerStats;
  error?: "no_points";
}

export function applyStatAllocationIntent(entity: EntitySnapshot, stats: PlayerStats, stat: StatName): StatAllocationResult {
  if (stats.points <= 0) {
    return {
      ok: false,
      entity,
      stats: { ...stats },
      error: "no_points",
    };
  }

  const nextStats = {
    ...stats,
    [stat]: stats[stat] + 1,
    points: stats.points - 1,
  };

  if (stat !== "vitality") {
    return {
      ok: true,
      entity,
      stats: nextStats,
    };
  }

  return {
    ok: true,
    entity: {
      ...entity,
      hp: entity.hp + 10,
      maxHp: entity.maxHp + 10,
    },
    stats: nextStats,
  };
}

export function grantStatPoints(stats: PlayerStats, levelsGained: number): PlayerStats {
  return {
    ...stats,
    points: stats.points + Math.max(0, levelsGained) * 3,
  };
}

export function getStatsAttackBonus(stats: PlayerStats): number {
  return stats.strength * 2;
}

export function getStatsSpellDamageBonus(stats: PlayerStats): number {
  return stats.intelligence * 2;
}

function isHostileTarget(entity: EntitySnapshot): boolean {
  return entity.kind !== "npc" || entity.disposition === "hostile";
}

export interface NpcInteractionResult {
  ok: boolean;
  dialogue?: NpcDialogue;
  error?: "out_of_range" | "not_interactive";
}

export function applyNpcInteractionIntent(entity: EntitySnapshot, npc: EntitySnapshot, eventFlags: PlayerEventFlags = {}, eventVariables: PlayerEventVariables = {}): NpcInteractionResult {
  const distance = Math.abs(entity.x - npc.x) + Math.abs(entity.y - npc.y);

  if (distance > 1) {
    return {
      ok: false,
      error: "out_of_range",
    };
  }

  const definition = getNpcDefinitionForEntity(npc);
  const text = definition?.dialogue[0];

  if (!text) {
    return {
      ok: false,
      error: "not_interactive",
    };
  }

  return {
    ok: true,
    dialogue: {
      npcId: npc.id,
      npcName: npc.name,
      text,
      options: createDialogueOptions(npc, eventFlags, eventVariables),
    },
  };
}

export interface NpcDialogueOptionResult {
  ok: boolean;
  eventFlags: PlayerEventFlags;
  eventVariables: PlayerEventVariables;
  rewards: ItemStack[];
  xpReward: number;
  goldReward: number;
  dialogue?: NpcDialogue;
  error?: "out_of_range" | "unknown_option" | "already_claimed" | "variable_limit" | "condition_not_met";
}

export function applyNpcDialogueOptionIntent(entity: EntitySnapshot, npc: EntitySnapshot, eventFlags: PlayerEventFlags, eventVariables: PlayerEventVariables, optionId: string): NpcDialogueOptionResult {
  const distance = Math.abs(entity.x - npc.x) + Math.abs(entity.y - npc.y);
  const nextFlags = { ...eventFlags };
  const nextVariables = { ...eventVariables };

  if (distance > 1) {
    return {
      ok: false,
      eventFlags: nextFlags,
      eventVariables: nextVariables,
      rewards: [],
      xpReward: 0,
      goldReward: 0,
      error: "out_of_range",
    };
  }

  if (npc.npcDefinitionId !== "guide" || (optionId !== "guide-starter-kit" && optionId !== "guide-training-mark" && optionId !== "guide-complete-training")) {
    return {
      ok: false,
      eventFlags: nextFlags,
      eventVariables: nextVariables,
      rewards: [],
      xpReward: 0,
      goldReward: 0,
      error: "unknown_option",
    };
  }

  if (optionId === "guide-complete-training") {
    const currentMarks = nextVariables["guide.trainingMarks"] ?? 0;

    if (nextFlags["guide.trainingComplete"]) {
      return {
        ok: false,
        eventFlags: nextFlags,
        eventVariables: nextVariables,
        rewards: [],
        xpReward: 0,
        goldReward: 0,
        error: "already_claimed",
      };
    }

    if (currentMarks < 3) {
      return {
        ok: false,
        eventFlags: nextFlags,
        eventVariables: nextVariables,
        rewards: [],
        xpReward: 0,
        goldReward: 0,
        error: "condition_not_met",
      };
    }

    nextFlags["guide.trainingComplete"] = true;

    return {
      ok: true,
      eventFlags: nextFlags,
      eventVariables: nextVariables,
      rewards: [{ itemId: "wood-log", name: "Madeira", quantity: 2 }],
      xpReward: 20,
      goldReward: 5,
      dialogue: {
        npcId: npc.id,
        npcName: npc.name,
        text: "Treinamento concluido. Receba sua recompensa e continue evoluindo.",
        options: createDialogueOptions(npc, nextFlags, nextVariables),
      },
    };
  }

  if (optionId === "guide-training-mark") {
    const currentMarks = nextVariables["guide.trainingMarks"] ?? 0;

    if (currentMarks >= 3) {
      return {
        ok: false,
        eventFlags: nextFlags,
        eventVariables: nextVariables,
        rewards: [],
        xpReward: 0,
        goldReward: 0,
        error: "variable_limit",
      };
    }

    nextVariables["guide.trainingMarks"] = currentMarks + 1;

    return {
      ok: true,
      eventFlags: nextFlags,
      eventVariables: nextVariables,
      rewards: [],
      xpReward: 0,
      goldReward: 0,
      dialogue: {
        npcId: npc.id,
        npcName: npc.name,
        text: `Treino registrado: ${nextVariables["guide.trainingMarks"]}/3.`,
        options: createDialogueOptions(npc, nextFlags, nextVariables),
      },
    };
  }

  if (nextFlags["guide.starterKitClaimed"]) {
    return {
      ok: false,
      eventFlags: nextFlags,
      eventVariables: nextVariables,
      rewards: [],
      xpReward: 0,
      goldReward: 0,
      error: "already_claimed",
    };
  }

  nextFlags["guide.starterKitClaimed"] = true;

  return {
    ok: true,
    eventFlags: nextFlags,
    eventVariables: nextVariables,
    rewards: [
      { itemId: "small-potion", name: "Pocao Pequena", quantity: 2 },
      { itemId: "training-scroll", name: "Pergaminho de Treino", quantity: 1 },
    ],
    xpReward: 0,
    goldReward: 0,
    dialogue: {
      npcId: npc.id,
      npcName: npc.name,
      text: "Aqui esta um kit inicial. Use com cuidado e continue treinando.",
      options: createDialogueOptions(npc, nextFlags, nextVariables),
    },
  };
}

function createDialogueOptions(npc: EntitySnapshot, eventFlags: PlayerEventFlags, eventVariables: PlayerEventVariables): NpcDialogue["options"] {
  if (npc.npcDefinitionId !== "guide") {
    return [];
  }

  const trainingMarks = eventVariables["guide.trainingMarks"] ?? 0;
  const trainingComplete = eventFlags["guide.trainingComplete"] === true;

  return [
    {
      optionId: "guide-starter-kit",
      label: eventFlags["guide.starterKitClaimed"] ? "Kit inicial ja recebido" : "Receber kit inicial",
      disabled: eventFlags["guide.starterKitClaimed"] === true,
    },
    {
      optionId: "guide-training-mark",
      label: trainingMarks >= 3 ? "Treino registrado 3/3" : `Registrar treino (${trainingMarks}/3)`,
      disabled: trainingMarks >= 3,
    },
    {
      optionId: "guide-complete-training",
      label: trainingComplete ? "Treinamento concluido" : "Concluir treinamento",
      disabled: trainingMarks < 3 || trainingComplete,
    },
  ];
}