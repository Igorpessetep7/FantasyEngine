import { z } from "zod";

export const DirectionSchema = z.enum(["up", "down", "left", "right"]);

export type Direction = z.infer<typeof DirectionSchema>;

export const EntityKindSchema = z.enum(["player", "npc"]);

export type EntityKind = z.infer<typeof EntityKindSchema>;

export const ItemStackSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
});

export type ItemStack = z.infer<typeof ItemStackSchema>;

export const ItemQuantitySchema = z.number().int().positive().max(9999);

export const MapItemSnapshotSchema = z.object({
  id: z.string(),
  item: ItemStackSchema,
  x: z.number().int(),
  y: z.number().int(),
});

export type MapItemSnapshot = z.infer<typeof MapItemSnapshotSchema>;

export const ResourceKindSchema = z.enum(["tree", "ore"]);

export type ResourceKind = z.infer<typeof ResourceKindSchema>;

export const ResourceSnapshotSchema = z.object({
  id: z.string(),
  kind: ResourceKindSchema,
  name: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  hp: z.number().int().nonnegative(),
  maxHp: z.number().int().positive(),
  depleted: z.boolean(),
});

export type ResourceSnapshot = z.infer<typeof ResourceSnapshotSchema>;

export const PlayerProgressSchema = z.object({
  level: z.number().int().positive(),
  xp: z.number().int().nonnegative(),
  xpToNext: z.number().int().positive(),
  gold: z.number().int().nonnegative(),
});

export type PlayerProgress = z.infer<typeof PlayerProgressSchema>;

export const ShopOfferSchema = z.object({
  item: ItemStackSchema,
  priceGold: z.number().int().nonnegative(),
});

export type ShopOffer = z.infer<typeof ShopOfferSchema>;

export const QuestStateSchema = z.object({
  questId: z.string(),
  title: z.string(),
  description: z.string(),
  target: z.object({
    kind: z.literal("defeatNpc"),
    npcName: z.string(),
    required: z.number().int().positive(),
  }),
  progress: z.number().int().nonnegative(),
  status: z.enum(["active", "completed", "claimed"]),
  reward: z.object({
    xp: z.number().int().nonnegative(),
    gold: z.number().int().nonnegative(),
    items: z.array(ItemStackSchema),
  }),
});

export type QuestState = z.infer<typeof QuestStateSchema>;

export const SpellDefinitionSchema = z.object({
  spellId: z.string(),
  name: z.string(),
  description: z.string(),
  range: z.number().int().positive(),
  damage: z.number().int().positive(),
  cooldownMs: z.number().int().positive(),
});

export type SpellDefinition = z.infer<typeof SpellDefinitionSchema>;

export const CraftingRecipeSchema = z.object({
  recipeId: z.string(),
  name: z.string(),
  description: z.string(),
  ingredients: z.array(ItemStackSchema),
  output: ItemStackSchema,
});

export type CraftingRecipe = z.infer<typeof CraftingRecipeSchema>;

export const EquipmentSlotSchema = z.enum(["weapon"]);

export type EquipmentSlot = z.infer<typeof EquipmentSlotSchema>;

export const EquippedItemSchema = z.object({
  slot: EquipmentSlotSchema,
  item: ItemStackSchema,
  attackBonus: z.number().int().nonnegative(),
});

export type EquippedItem = z.infer<typeof EquippedItemSchema>;

export const EquipmentStateSchema = z.object({
  weapon: EquippedItemSchema.nullable(),
});

export type EquipmentState = z.infer<typeof EquipmentStateSchema>;

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("client.hello"),
    clientId: z.string().trim().min(16).max(80),
    name: z.string().trim().min(1).max(24),
  }),
  z.object({
    type: z.literal("input.move"),
    direction: DirectionSchema,
    sequence: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.object({
    type: z.literal("input.attack"),
    sequence: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.object({
    type: z.literal("input.pickup"),
    itemInstanceId: z.string().min(1).max(80),
    sequence: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.object({
    type: z.literal("input.gatherResource"),
    resourceId: z.string().min(1).max(80),
    sequence: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.object({
    type: z.literal("input.shopBuy"),
    itemId: z.string().min(1).max(80),
    sequence: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.object({
    type: z.literal("input.useItem"),
    itemId: z.string().min(1).max(80),
    sequence: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.object({
    type: z.literal("input.castSpell"),
    spellId: z.string().min(1).max(80),
    sequence: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.object({
    type: z.literal("input.bankDeposit"),
    itemId: z.string().min(1).max(80),
    quantity: ItemQuantitySchema,
    sequence: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.object({
    type: z.literal("input.bankWithdraw"),
    itemId: z.string().min(1).max(80),
    quantity: ItemQuantitySchema,
    sequence: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.object({
    type: z.literal("input.craftItem"),
    recipeId: z.string().min(1).max(80),
    sequence: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.object({
    type: z.literal("input.equipItem"),
    itemId: z.string().min(1).max(80),
    sequence: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.object({
    type: z.literal("input.unequipItem"),
    slot: EquipmentSlotSchema,
    sequence: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.object({
    type: z.literal("chat.send"),
    text: z.string().trim().min(1).max(180),
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const EntitySnapshotSchema = z.object({
  id: z.string(),
  kind: EntityKindSchema,
  name: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  direction: DirectionSchema,
  hp: z.number().int().nonnegative(),
  maxHp: z.number().int().positive(),
});

export type EntitySnapshot = z.infer<typeof EntitySnapshotSchema>;

export const TileLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  tiles: z.array(z.number().int().nonnegative()),
});

export type TileLayer = z.infer<typeof TileLayerSchema>;

export const MapSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tileSize: z.number().int().positive(),
  layers: z.array(TileLayerSchema),
  blocked: z.array(z.boolean()),
});

export type MapSnapshot = z.infer<typeof MapSnapshotSchema>;

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("world.init"),
    selfId: z.string(),
    map: MapSnapshotSchema,
    entities: z.array(EntitySnapshotSchema),
    mapItems: z.array(MapItemSnapshotSchema),
    resources: z.array(ResourceSnapshotSchema),
    inventory: z.array(ItemStackSchema),
    bank: z.array(ItemStackSchema),
    equipment: EquipmentStateSchema,
    progress: PlayerProgressSchema,
    shopOffers: z.array(ShopOfferSchema),
    quests: z.array(QuestStateSchema),
    spells: z.array(SpellDefinitionSchema),
    craftingRecipes: z.array(CraftingRecipeSchema),
  }),
  z.object({
    type: z.literal("world.entities"),
    entities: z.array(EntitySnapshotSchema),
  }),
  z.object({
    type: z.literal("world.mapItems"),
    mapItems: z.array(MapItemSnapshotSchema),
  }),
  z.object({
    type: z.literal("world.resources"),
    resources: z.array(ResourceSnapshotSchema),
  }),
  z.object({
    type: z.literal("inventory.update"),
    inventory: z.array(ItemStackSchema),
  }),
  z.object({
    type: z.literal("bank.update"),
    bank: z.array(ItemStackSchema),
  }),
  z.object({
    type: z.literal("equipment.update"),
    equipment: EquipmentStateSchema,
  }),
  z.object({
    type: z.literal("player.progress"),
    progress: PlayerProgressSchema,
  }),
  z.object({
    type: z.literal("shop.offers"),
    shopOffers: z.array(ShopOfferSchema),
  }),
  z.object({
    type: z.literal("quest.update"),
    quests: z.array(QuestStateSchema),
  }),
  z.object({
    type: z.literal("spell.list"),
    spells: z.array(SpellDefinitionSchema),
  }),
  z.object({
    type: z.literal("craft.list"),
    craftingRecipes: z.array(CraftingRecipeSchema),
  }),
  z.object({
    type: z.literal("chat.message"),
    from: z.string(),
    text: z.string(),
  }),
  z.object({
    type: z.literal("server.error"),
    code: z.string(),
    message: z.string(),
  }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(ServerMessageSchema.parse(message));
}

export function decodeClientMessage(payload: unknown): ClientMessage {
  if (typeof payload !== "string" || payload.length > 2048) {
    throw new Error("Mensagem invalida ou grande demais.");
  }

  return ClientMessageSchema.parse(JSON.parse(payload));
}

export function decodeServerMessage(payload: unknown): ServerMessage {
  if (typeof payload !== "string" || payload.length > 64_000) {
    throw new Error("Mensagem invalida ou grande demais.");
  }

  return ServerMessageSchema.parse(JSON.parse(payload));
}