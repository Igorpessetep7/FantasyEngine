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

export const MapItemSnapshotSchema = z.object({
  id: z.string(),
  item: ItemStackSchema,
  x: z.number().int(),
  y: z.number().int(),
});

export type MapItemSnapshot = z.infer<typeof MapItemSnapshotSchema>;

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
    inventory: z.array(ItemStackSchema),
    progress: PlayerProgressSchema,
    shopOffers: z.array(ShopOfferSchema),
    quests: z.array(QuestStateSchema),
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
    type: z.literal("inventory.update"),
    inventory: z.array(ItemStackSchema),
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