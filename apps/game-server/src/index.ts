import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { createCharacterRepository } from "@fantasy-engine/database";
import { applyAttackIntent, applyBankDepositIntent, applyBankWithdrawIntent, applyClassChoiceIntent, applyCraftIntent, applyEquipItemIntent, applyItemUseIntent, applyMoveIntent, applyNpcDialogueOptionIntent, applyNpcInteractionIntent, applyPurchaseIntent, applyQuestNpcDefeat, applyResourceGatherIntent, applySpellCastIntent, applyStatAllocationIntent, applyTeleportIntent, applyTileAttributeEffect, applyUnequipItemIntent, awardEventProgress, awardNpcDefeat, canPickupItem, claimCompletedQuestRewards, createInitialEquipment, createInitialEventFlags, createInitialEventVariables, createInitialProgress, createInitialQuests, createInitialStats, createNpc, createPlayer, createResource, getEquipmentAttackBonus, getNpcAttackDamage, getNpcLoot, getNpcRespawnMs, getStatsAttackBonus, getStatsSpellDamageBonus, grantStatPoints, isEntityInSafeZone, respawnEntity, starterClasses, starterCraftingRecipes, starterShopOffers, starterSpells } from "@fantasy-engine/game-rules";
import { starterMap } from "@fantasy-engine/map-format";
import { decodeClientMessage, encodeServerMessage, type ClassId, type EntitySnapshot, type EquipmentSlot, type EquipmentState, type ItemStack, type MapItemSnapshot, type PlayerClass, type PlayerEventFlags, type PlayerEventVariables, type PlayerProgress, type PlayerStats, type QuestState, type ResourceSnapshot, type ServerMessage, type StatName } from "@fantasy-engine/protocol";

const port = Number(process.env.GAME_SERVER_PORT ?? 8787);
const tickMs = 100;
const minMoveMs = 130;
const minAttackMs = 500;
const minPickupMs = 250;
const minResourceMs = 700;
const minShopMs = 250;
const minUseItemMs = 350;
const minBankMs = 250;
const minCraftMs = 400;
const minEquipmentMs = 300;
const minStatMs = 250;
const minClassMs = 500;
const minInteractMs = 300;

interface Session {
  id: string;
  clientId?: string;
  socket: WebSocket;
  player: EntitySnapshot;
  inventory: ItemStack[];
  bank: ItemStack[];
  equipment: EquipmentState;
  progress: PlayerProgress;
  stats: PlayerStats;
  eventFlags: PlayerEventFlags;
  eventVariables: PlayerEventVariables;
  playerClass: PlayerClass | null;
  quests: QuestState[];
  lastMoveAt: number;
  lastAttackAt: number;
  lastPickupAt: number;
  lastResourceAt: number;
  lastShopAt: number;
  lastUseItemAt: number;
  lastBankAt: number;
  lastCraftAt: number;
  lastEquipmentAt: number;
  lastStatAt: number;
  lastClassAt: number;
  lastInteractAt: number;
  lastSpellAt: Record<string, number>;
  lastSequence: number;
}

const characterRepository = createCharacterRepository();
await characterRepository.initialize();

const sessions = new Map<string, Session>();
const npcs = new Map<string, EntitySnapshot>([
  ["npc-slime-1", createNpc("npc-slime-1", "slime", 8, 4)],
  ["npc-slime-2", createNpc("npc-slime-2", "slime", 14, 9)],
  ["npc-guard-1", createNpc("npc-guard-1", "guard", 18, 6)],
  ["npc-guide-1", createNpc("npc-guide-1", "guide", 6, 5)],
]);
const mapItems = new Map<string, MapItemSnapshot>();
const resources = new Map<string, ResourceSnapshot>([
  ["resource-tree-1", createResource("resource-tree-1", "tree", 5, 4)],
  ["resource-tree-2", createResource("resource-tree-2", "tree", 10, 7)],
  ["resource-ore-1", createResource("resource-ore-1", "ore", 4, 6)],
]);

const httpServer = createServer((_, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true, service: "fantasy-engine-game-server" }));
});

const webSocketServer = new WebSocketServer({ server: httpServer });

webSocketServer.on("connection", (socket) => {
  const session = createSession(socket);
  sessions.set(session.id, session);

  send(session, {
    type: "world.init",
    selfId: session.id,
    map: starterMap,
    entities: getEntities(),
    mapItems: getMapItems(),
    resources: getResources(),
    inventory: session.inventory,
    bank: session.bank,
    equipment: session.equipment,
    progress: session.progress,
    stats: session.stats,
    eventFlags: session.eventFlags,
    eventVariables: session.eventVariables,
    playerClass: session.playerClass,
    classOptions: starterClasses,
    shopOffers: starterShopOffers,
    quests: session.quests,
    spells: starterSpells,
    craftingRecipes: starterCraftingRecipes,
  });

  socket.on("message", (payload) => {
    void handleMessage(session, payload.toString("utf8"));
  });
  socket.on("close", () => {
    sessions.delete(session.id);
    if (session.clientId) {
      void saveSession(session);
      broadcastChat("Sistema", `${session.player.name} saiu do mundo.`);
    }
    broadcastEntities();
  });
});

setInterval(broadcastEntities, tickMs);

httpServer.listen(port, () => {
  console.log(`Fantasy Engine game server em ws://localhost:${port}`);
  console.log(`Persistencia de personagens: ${characterRepository.mode}`);
});

function createSession(socket: WebSocket): Session {
  const id = randomUUID();

  return {
    id,
    socket,
    player: createPlayer(id, `Player-${id.slice(0, 4)}`, starterMap),
    inventory: [],
    bank: [],
    equipment: createInitialEquipment(),
    progress: createInitialProgress(),
    stats: createInitialStats(),
    eventFlags: createInitialEventFlags(),
    eventVariables: createInitialEventVariables(),
    playerClass: null,
    quests: createInitialQuests(),
    lastMoveAt: 0,
    lastAttackAt: 0,
    lastPickupAt: 0,
    lastResourceAt: 0,
    lastShopAt: 0,
    lastUseItemAt: 0,
    lastBankAt: 0,
    lastCraftAt: 0,
    lastEquipmentAt: 0,
    lastStatAt: 0,
    lastClassAt: 0,
    lastInteractAt: 0,
    lastSpellAt: {},
    lastSequence: 0,
  };
}

async function handleMessage(session: Session, payload: string): Promise<void> {
  try {
    const message = decodeClientMessage(payload);

    switch (message.type) {
      case "client.hello":
        await handleHello(session, message.clientId, message.name);
        broadcastEntities();
        return;
      case "input.move":
        await handleMove(session, message.direction, message.sequence);
        return;
      case "input.attack":
        handleAttack(session, message.sequence);
        return;
      case "input.pickup":
        await handlePickup(session, message.itemInstanceId, message.sequence);
        return;
      case "input.gatherResource":
        await handleGatherResource(session, message.resourceId, message.sequence);
        return;
      case "input.shopBuy":
        await handleShopBuy(session, message.itemId, message.sequence);
        return;
      case "input.useItem":
        await handleUseItem(session, message.itemId, message.sequence);
        return;
      case "input.castSpell":
        handleCastSpell(session, message.spellId, message.sequence);
        return;
      case "input.bankDeposit":
        await handleBankDeposit(session, message.itemId, message.quantity, message.sequence);
        return;
      case "input.bankWithdraw":
        await handleBankWithdraw(session, message.itemId, message.quantity, message.sequence);
        return;
      case "input.craftItem":
        await handleCraftItem(session, message.recipeId, message.sequence);
        return;
      case "input.equipItem":
        await handleEquipItem(session, message.itemId, message.sequence);
        return;
      case "input.unequipItem":
        await handleUnequipItem(session, message.slot, message.sequence);
        return;
      case "input.allocateStat":
        await handleAllocateStat(session, message.stat, message.sequence);
        return;
      case "input.chooseClass":
        await handleChooseClass(session, message.classId, message.sequence);
        return;
      case "input.interactNpc":
        handleInteractNpc(session, message.npcId, message.sequence);
        return;
      case "input.chooseNpcDialogueOption":
        void handleChooseNpcDialogueOption(session, message.npcId, message.optionId, message.sequence);
        return;
      case "chat.send":
        broadcastChat(session.player.name, message.text);
        return;
    }
  } catch {
    send(session, {
      type: "server.error",
      code: "bad_message",
      message: "Mensagem recusada pelo servidor.",
    });
  }
}

async function handleHello(session: Session, clientId: string, name: string): Promise<void> {
  session.clientId = clientId;

  const state = await characterRepository.loadOrCreate(clientId, {
    player: { ...session.player, name },
    inventory: session.inventory,
    bank: session.bank,
    equipment: session.equipment,
    progress: session.progress,
    stats: session.stats,
    eventFlags: session.eventFlags,
    eventVariables: session.eventVariables,
    playerClass: session.playerClass,
    quests: session.quests,
  });

  session.player = state.player;
  session.inventory = state.inventory;
  session.bank = state.bank;
  session.equipment = state.equipment;
  session.progress = state.progress;
  session.stats = state.stats;
  session.eventFlags = state.eventFlags;
  session.eventVariables = state.eventVariables;
  session.playerClass = state.playerClass;
  session.quests = state.quests.length > 0 ? state.quests : createInitialQuests();

  send(session, {
    type: "world.init",
    selfId: session.id,
    map: starterMap,
    entities: getEntities(),
    mapItems: getMapItems(),
    resources: getResources(),
    inventory: session.inventory,
    bank: session.bank,
    equipment: session.equipment,
    progress: session.progress,
    stats: session.stats,
    eventFlags: session.eventFlags,
    eventVariables: session.eventVariables,
    playerClass: session.playerClass,
    classOptions: starterClasses,
    shopOffers: starterShopOffers,
    quests: session.quests,
    spells: starterSpells,
    craftingRecipes: starterCraftingRecipes,
  });
  broadcastChat("Sistema", `${session.player.name} entrou no mundo.`);
}

async function handleMove(session: Session, direction: EntitySnapshot["direction"], sequence: number): Promise<void> {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastMoveAt < minMoveMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_move",
      message: "Movimento enviado rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastMoveAt = now;
  const move = applyMoveIntent(session.player, direction, starterMap);
  session.player = move.entity;
  const attribute = move.moved ? applyTileAttributeEffect(session.player, starterMap) : { triggered: false, entity: session.player };

  if (attribute.error) {
    send(session, {
      type: "server.error",
      code: attribute.error,
      message: "Atributo de tile recusado pelo servidor.",
    });
  } else {
    session.player = attribute.entity;

    if (attribute.triggered && attribute.attributeKind === "warp") {
      broadcastChat("Mapa", `${session.player.name} atravessou ${attribute.label ?? "um warp"}.`);
    }

    if (attribute.triggered && attribute.attributeKind === "damage") {
      broadcastChat("Mapa", `${session.player.name} sofreu ${attribute.damage ?? 0} de dano em ${attribute.label ?? "um tile perigoso"}.`);

      if (session.player.hp === 0) {
        const respawn = respawnEntity(session.player, starterMap);
        session.player = respawn.entity;
        broadcastChat("Sistema", `${session.player.name} retornou para ${respawn.label}.`);
      }
    }
  }

  await saveSession(session);
  broadcastEntities();
}

function handleAttack(session: Session, sequence: number): void {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastAttackAt < minAttackMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_attack",
      message: "Ataque enviado rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastAttackAt = now;

  if (isEntityInSafeZone(session.player, starterMap)) {
    send(session, {
      type: "server.error",
      code: "safe_zone_combat",
      message: "Combate bloqueado em zona segura.",
    });
    return;
  }

  const result = applyAttackIntent(session.player, [...npcs.values()], getEquipmentAttackBonus(session.equipment) + getStatsAttackBonus(session.stats));

  if (!result) {
    return;
  }

  npcs.set(result.target.id, result.target);
  broadcastChat("Combate", `${session.player.name} causou ${result.damage} de dano em ${result.target.name}.`);

  if (!result.defeated) {
    applyNpcCounterAttack(session, result.target);
  }

  if (result.defeated) {
    handleNpcDefeat(session, result.target);
  }

  broadcastEntities();
}

function applyNpcCounterAttack(session: Session, npc: EntitySnapshot): void {
  const damage = getNpcAttackDamage(npc);

  if (damage <= 0 || isEntityInSafeZone(session.player, starterMap)) {
    return;
  }

  session.player = {
    ...session.player,
    hp: Math.max(0, session.player.hp - damage),
  };

  broadcastChat("Combate", `${npc.name} contra-atacou ${session.player.name} causando ${damage} de dano.`);

  if (session.player.hp === 0) {
    const respawn = respawnEntity(session.player, starterMap);
    session.player = respawn.entity;
    broadcastChat("Sistema", `${session.player.name} retornou para ${respawn.label}.`);
  }

  void saveSession(session);
}

function scheduleNpcRespawn(npc: EntitySnapshot): void {
  const respawnMs = getNpcRespawnMs(npc);

  if (respawnMs <= 0) {
    return;
  }

  setTimeout(() => {
    npcs.set(npc.id, { ...npc, hp: npc.maxHp });
    broadcastChat("Sistema", `${npc.name} reapareceu.`);
    broadcastEntities();
  }, respawnMs);
}

function getEntities(): EntitySnapshot[] {
  const players = [...sessions.values()].map((session) => session.player);
  const aliveNpcs = [...npcs.values()].filter((npc) => npc.hp > 0);

  return players.concat(aliveNpcs);
}

function broadcastEntities(): void {
  broadcast({
    type: "world.entities",
    entities: getEntities(),
  });
}

function broadcastChat(from: string, text: string): void {
  broadcast({
    type: "chat.message",
    from,
    text,
  });
}

function broadcast(message: ServerMessage): void {
  for (const session of sessions.values()) {
    send(session, message);
  }
}

function send(session: Session, message: ServerMessage): void {
  if (session.socket.readyState === session.socket.OPEN) {
    session.socket.send(encodeServerMessage(message));
  }
}

async function handlePickup(session: Session, itemInstanceId: string, sequence: number): Promise<void> {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastPickupAt < minPickupMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_pickup",
      message: "Coleta enviada rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastPickupAt = now;

  const mapItem = mapItems.get(itemInstanceId);

  if (!mapItem || !canPickupItem(session.player, mapItem)) {
    send(session, {
      type: "server.error",
      code: "invalid_pickup",
      message: "Item fora de alcance.",
    });
    return;
  }

  mapItems.delete(mapItem.id);
  addInventoryItem(session.inventory, mapItem.item);
  await saveSession(session);
  sendInventory(session);
  broadcastMapItems();
  broadcastChat("Loot", `${session.player.name} pegou ${mapItem.item.quantity}x ${mapItem.item.name}.`);
}

function createDrop(npc: EntitySnapshot): void {
  for (const item of getNpcLoot(npc)) {
    const drop: MapItemSnapshot = {
      id: randomUUID(),
      item,
      x: npc.x,
      y: npc.y,
    };

    mapItems.set(drop.id, drop);
  }

  broadcastMapItems();
}

function addInventoryItem(inventory: ItemStack[], item: ItemStack): void {
  const existing = inventory.find((stack) => stack.itemId === item.itemId);

  if (existing) {
    existing.quantity += item.quantity;
    return;
  }

  inventory.push({ ...item });
}

function getMapItems(): MapItemSnapshot[] {
  return [...mapItems.values()];
}

function broadcastMapItems(): void {
  broadcast({
    type: "world.mapItems",
    mapItems: getMapItems(),
  });
}

function getResources(): ResourceSnapshot[] {
  return [...resources.values()];
}

function broadcastResources(): void {
  broadcast({
    type: "world.resources",
    resources: getResources(),
  });
}

async function handleGatherResource(session: Session, resourceId: string, sequence: number): Promise<void> {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastResourceAt < minResourceMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_resource",
      message: "Coleta de recurso enviada rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastResourceAt = now;

  const resource = resources.get(resourceId);

  if (!resource) {
    send(session, {
      type: "server.error",
      code: "unknown_resource",
      message: "Recurso inexistente.",
    });
    return;
  }

  const result = applyResourceGatherIntent(session.player, resource);

  if (!result.ok || !result.item) {
    send(session, {
      type: "server.error",
      code: result.error ?? "resource_denied",
      message: resourceErrorMessage(result.error),
    });
    return;
  }

  resources.set(resource.id, result.resource);
  addInventoryItem(session.inventory, result.item);
  await saveSession(session);
  sendInventory(session);
  broadcastResources();
  broadcastChat("Recurso", `${session.player.name} coletou ${result.item.quantity}x ${result.item.name} de ${resource.name}.`);

  if (result.depleted) {
    broadcastChat("Recurso", `${resource.name} foi esgotado.`);
    scheduleResourceRespawn(result.resource);
  }
}

function scheduleResourceRespawn(resource: ResourceSnapshot): void {
  setTimeout(() => {
    resources.set(resource.id, { ...resource, hp: resource.maxHp, depleted: false });
    broadcastChat("Sistema", `${resource.name} voltou a ficar disponivel.`);
    broadcastResources();
  }, 8000);
}

function sendInventory(session: Session): void {
  send(session, {
    type: "inventory.update",
    inventory: session.inventory,
  });
}

function sendBank(session: Session): void {
  send(session, {
    type: "bank.update",
    bank: session.bank,
  });
}

function sendEquipment(session: Session): void {
  send(session, {
    type: "equipment.update",
    equipment: session.equipment,
  });
}

async function handleShopBuy(session: Session, itemId: string, sequence: number): Promise<void> {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastShopAt < minShopMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_shop",
      message: "Compra enviada rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastShopAt = now;

  const result = applyPurchaseIntent(session.progress, itemId);

  if (!result.ok || !result.item) {
    send(session, {
      type: "server.error",
      code: result.error ?? "shop_denied",
      message: result.error === "not_enough_gold" ? "Gold insuficiente." : "Item indisponivel.",
    });
    return;
  }

  session.progress = result.progress;
  addInventoryItem(session.inventory, result.item);
  await saveSession(session);
  sendProgress(session);
  sendInventory(session);
  broadcastChat("Shop", `${session.player.name} comprou ${result.item.quantity}x ${result.item.name}.`);
}

async function handleUseItem(session: Session, itemId: string, sequence: number): Promise<void> {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastUseItemAt < minUseItemMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_item_use",
      message: "Uso de item enviado rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastUseItemAt = now;

  const inventoryItem = session.inventory.find((item) => item.itemId === itemId && item.quantity > 0);

  if (!inventoryItem) {
    send(session, {
      type: "server.error",
      code: "missing_item",
      message: "Item nao encontrado no inventario.",
    });
    return;
  }

  const result = applyItemUseIntent(session.player, itemId);

  if (!result.ok) {
    send(session, {
      type: "server.error",
      code: result.error ?? "item_use_denied",
      message: itemUseErrorMessage(result.error),
    });
    return;
  }

  session.player = result.entity;

  if (result.consumed) {
    removeInventoryItem(session.inventory, itemId, 1);
  }

  await saveSession(session);
  sendInventory(session);
  broadcastEntities();
  broadcastChat("Item", `${session.player.name} usou ${inventoryItem.name} e ${result.message}.`);
}

async function handleBankDeposit(session: Session, itemId: string, quantity: number, sequence: number): Promise<void> {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastBankAt < minBankMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_bank",
      message: "Banco usado rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastBankAt = now;

  const result = applyBankDepositIntent(session.inventory, session.bank, itemId, quantity);

  if (!result.ok || !result.item) {
    send(session, {
      type: "server.error",
      code: result.error ?? "bank_denied",
      message: bankErrorMessage(result.error),
    });
    return;
  }

  session.inventory = result.inventory;
  session.bank = result.bank;
  await saveSession(session);
  sendInventory(session);
  sendBank(session);
  broadcastChat("Banco", `${session.player.name} depositou ${result.item.quantity}x ${result.item.name}.`);
}

async function handleBankWithdraw(session: Session, itemId: string, quantity: number, sequence: number): Promise<void> {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastBankAt < minBankMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_bank",
      message: "Banco usado rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastBankAt = now;

  const result = applyBankWithdrawIntent(session.inventory, session.bank, itemId, quantity);

  if (!result.ok || !result.item) {
    send(session, {
      type: "server.error",
      code: result.error ?? "bank_denied",
      message: bankErrorMessage(result.error),
    });
    return;
  }

  session.inventory = result.inventory;
  session.bank = result.bank;
  await saveSession(session);
  sendInventory(session);
  sendBank(session);
  broadcastChat("Banco", `${session.player.name} sacou ${result.item.quantity}x ${result.item.name}.`);
}

async function handleCraftItem(session: Session, recipeId: string, sequence: number): Promise<void> {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastCraftAt < minCraftMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_craft",
      message: "Craft enviado rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastCraftAt = now;

  const result = applyCraftIntent(session.inventory, recipeId);

  if (!result.ok || !result.output || !result.recipe) {
    send(session, {
      type: "server.error",
      code: result.error ?? "craft_denied",
      message: craftErrorMessage(result.error),
    });
    return;
  }

  session.inventory = result.inventory;
  await saveSession(session);
  sendInventory(session);
  broadcastChat("Craft", `${session.player.name} criou ${result.output.quantity}x ${result.output.name}.`);
}

async function handleEquipItem(session: Session, itemId: string, sequence: number): Promise<void> {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastEquipmentAt < minEquipmentMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_equipment",
      message: "Equipment usado rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastEquipmentAt = now;

  const result = applyEquipItemIntent(session.inventory, session.equipment, itemId);

  if (!result.ok || !result.item) {
    send(session, {
      type: "server.error",
      code: result.error ?? "equipment_denied",
      message: equipmentErrorMessage(result.error),
    });
    return;
  }

  session.inventory = result.inventory;
  session.equipment = result.equipment;
  await saveSession(session);
  sendInventory(session);
  sendEquipment(session);
  broadcastChat("Equipment", `${session.player.name} equipou ${result.item.item.name}.`);
}

async function handleUnequipItem(session: Session, slot: EquipmentSlot, sequence: number): Promise<void> {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastEquipmentAt < minEquipmentMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_equipment",
      message: "Equipment usado rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastEquipmentAt = now;

  const result = applyUnequipItemIntent(session.inventory, session.equipment, slot);

  if (!result.ok || !result.item) {
    send(session, {
      type: "server.error",
      code: result.error ?? "equipment_denied",
      message: equipmentErrorMessage(result.error),
    });
    return;
  }

  session.inventory = result.inventory;
  session.equipment = result.equipment;
  await saveSession(session);
  sendInventory(session);
  sendEquipment(session);
  broadcastChat("Equipment", `${session.player.name} removeu ${result.item.item.name}.`);
}

async function handleAllocateStat(session: Session, stat: StatName, sequence: number): Promise<void> {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastStatAt < minStatMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_stats",
      message: "Atributo enviado rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastStatAt = now;

  const result = applyStatAllocationIntent(session.player, session.stats, stat);

  if (!result.ok) {
    send(session, {
      type: "server.error",
      code: result.error ?? "stat_denied",
      message: result.error === "no_points" ? "Sem pontos de atributo." : "Atributo recusado.",
    });
    return;
  }

  session.player = result.entity;
  session.stats = result.stats;
  await saveSession(session);
  sendStats(session);
  broadcastEntities();
  broadcastChat("Atributos", `${session.player.name} aumentou ${stat}.`);
}

async function handleChooseClass(session: Session, classId: ClassId, sequence: number): Promise<void> {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastClassAt < minClassMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_class",
      message: "Classe enviada rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastClassAt = now;

  const result = applyClassChoiceIntent(session.player, session.stats, session.playerClass, classId);

  if (!result.ok || !result.playerClass) {
    send(session, {
      type: "server.error",
      code: result.error ?? "class_denied",
      message: classChoiceErrorMessage(result.error),
    });
    return;
  }

  session.player = result.entity;
  session.stats = result.stats;
  session.playerClass = result.playerClass;
  await saveSession(session);
  send(session, {
    type: "player.class",
    playerClass: session.playerClass,
    stats: session.stats,
  });
  broadcastEntities();
  broadcastChat("Classes", `${session.player.name} escolheu ${session.playerClass.name}.`);
}

function handleInteractNpc(session: Session, npcId: string, sequence: number): void {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastInteractAt < minInteractMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_interact",
      message: "Interacao enviada rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastInteractAt = now;

  const npc = npcs.get(npcId);

  if (!npc || npc.hp <= 0) {
    send(session, {
      type: "server.error",
      code: "unknown_npc",
      message: "NPC indisponivel.",
    });
    return;
  }

  const result = applyNpcInteractionIntent(session.player, npc, session.eventFlags, session.eventVariables);

  if (!result.ok || !result.dialogue) {
    send(session, {
      type: "server.error",
      code: result.error ?? "interaction_denied",
      message: npcInteractionErrorMessage(result.error),
    });
    return;
  }

  send(session, {
    type: "npc.dialogue",
    dialogue: result.dialogue,
  });
}

async function handleChooseNpcDialogueOption(session: Session, npcId: string, optionId: string, sequence: number): Promise<void> {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  if (sequence <= session.lastSequence || now - session.lastInteractAt < minInteractMs) {
    send(session, {
      type: "server.error",
      code: "rate_limited_interact",
      message: "Interacao enviada rapido demais.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastInteractAt = now;

  const npc = npcs.get(npcId);

  if (!npc || npc.hp <= 0) {
    send(session, {
      type: "server.error",
      code: "unknown_npc",
      message: "NPC indisponivel.",
    });
    return;
  }

  const result = applyNpcDialogueOptionIntent(session.player, npc, session.eventFlags, session.eventVariables, optionId);

  if (!result.ok || !result.dialogue) {
    send(session, {
      type: "server.error",
      code: result.error ?? "dialogue_option_denied",
      message: npcDialogueOptionErrorMessage(result.error),
    });
    return;
  }

  session.eventFlags = result.eventFlags;
  session.eventVariables = result.eventVariables;

  for (const item of result.rewards) {
    addInventoryItem(session.inventory, item);
  }

  const previousLevel = session.progress.level;

  if (result.xpReward > 0 || result.goldReward > 0) {
    const award = awardEventProgress(session.progress, result.xpReward, result.goldReward);
    session.progress = award.progress;

    if (session.progress.level > previousLevel) {
      session.stats = grantStatPoints(session.stats, session.progress.level - previousLevel);
      sendStats(session);
      broadcastChat("Progresso", `${session.player.name} recebeu pontos de atributo por subir de level.`);
    }
  }

  if (result.teleport) {
    const teleport = applyTeleportIntent(session.player, starterMap, result.teleport);

    if (!teleport.ok) {
      send(session, {
        type: "server.error",
        code: teleport.error ?? "teleport_denied",
        message: "Destino de teleport invalido.",
      });
      return;
    }

    session.player = teleport.entity;
  }

  await saveSession(session);

  if (result.rewards.length > 0) {
    sendInventory(session);
  }

  if (result.xpReward > 0 || result.goldReward > 0) {
    sendProgress(session);
  }

  sendEventFlags(session);
  sendEventVariables(session);
  send(session, {
    type: "npc.dialogue",
    dialogue: result.dialogue,
  });
  if (result.teleport) {
    broadcastEntities();
  }
  broadcastChat("Evento", eventOptionMessage(session.player.name, npc.name, optionId, result.xpReward, result.goldReward));
}

function sendProgress(session: Session): void {
  send(session, {
    type: "player.progress",
    progress: session.progress,
  });
}

function sendStats(session: Session): void {
  send(session, {
    type: "player.stats",
    stats: session.stats,
  });
}

function sendEventFlags(session: Session): void {
  send(session, {
    type: "player.eventFlags",
    eventFlags: session.eventFlags,
  });
}

function sendEventVariables(session: Session): void {
  send(session, {
    type: "player.eventVariables",
    eventVariables: session.eventVariables,
  });
}

async function saveSession(session: Session): Promise<void> {
  if (!session.clientId) {
    return;
  }

  await characterRepository.save(session.clientId, {
    player: session.player,
    inventory: session.inventory,
    bank: session.bank,
    equipment: session.equipment,
    progress: session.progress,
    stats: session.stats,
    eventFlags: session.eventFlags,
    eventVariables: session.eventVariables,
    playerClass: session.playerClass,
    quests: session.quests,
  });
}

function updateQuestProgressForNpcDefeat(session: Session, npc: EntitySnapshot): void {
  const questProgress = applyQuestNpcDefeat(session.quests, npc);

  if (questProgress.completed.length === 0 && questProgress.quests === session.quests) {
    return;
  }

  session.quests = questProgress.quests;

  for (const quest of questProgress.completed) {
    broadcastChat("Quest", `${session.player.name} completou ${quest.title}.`);
  }

  const previousLevel = session.progress.level;
  const rewards = claimCompletedQuestRewards(session.progress, session.inventory, session.quests);
  session.progress = rewards.progress;
  session.inventory = rewards.inventory;
  session.quests = rewards.quests;

  if (session.progress.level > previousLevel) {
    session.stats = grantStatPoints(session.stats, session.progress.level - previousLevel);
    sendStats(session);
    broadcastChat("Progresso", `${session.player.name} recebeu pontos de atributo por subir de level.`);
  }

  for (const quest of rewards.claimed) {
    broadcastChat("Quest", `${session.player.name} recebeu recompensa de ${quest.title}.`);
  }

  sendProgress(session);
  sendInventory(session);
  sendQuests(session);
  void saveSession(session);
}

function sendQuests(session: Session): void {
  send(session, {
    type: "quest.update",
    quests: session.quests,
  });
}

function removeInventoryItem(inventory: ItemStack[], itemId: string, quantity: number): void {
  const existing = inventory.find((stack) => stack.itemId === itemId);

  if (!existing) {
    return;
  }

  existing.quantity -= quantity;

  if (existing.quantity <= 0) {
    inventory.splice(inventory.indexOf(existing), 1);
  }
}

function itemUseErrorMessage(error: string | undefined): string {
  switch (error) {
    case "already_full":
      return "Vida ja esta cheia.";
    case "not_usable":
      return "Este item ainda nao pode ser usado.";
    default:
      return "Item indisponivel.";
  }
}

function bankErrorMessage(error: string | undefined): string {
  switch (error) {
    case "missing_item":
      return "Item nao encontrado.";
    case "invalid_quantity":
      return "Quantidade invalida.";
    default:
      return "Operacao bancaria recusada.";
  }
}

function resourceErrorMessage(error: string | undefined): string {
  switch (error) {
    case "out_of_range":
      return "Recurso fora de alcance.";
    case "depleted":
      return "Recurso esgotado.";
    default:
      return "Coleta recusada.";
  }
}

function craftErrorMessage(error: string | undefined): string {
  switch (error) {
    case "unknown_recipe":
      return "Receita indisponivel.";
    case "missing_ingredients":
      return "Ingredientes insuficientes.";
    default:
      return "Craft recusado.";
  }
}

function equipmentErrorMessage(error: string | undefined): string {
  switch (error) {
    case "missing_item":
      return "Item nao encontrado no inventario.";
    case "not_equippable":
      return "Item nao pode ser equipado.";
    case "empty_slot":
      return "Slot vazio.";
    default:
      return "Equipment recusado.";
  }
}

function classChoiceErrorMessage(error: string | undefined): string {
  switch (error) {
    case "already_chosen":
      return "Classe ja escolhida para este personagem.";
    case "unknown_class":
      return "Classe indisponivel.";
    default:
      return "Escolha de classe recusada.";
  }
}

function npcInteractionErrorMessage(error: string | undefined): string {
  switch (error) {
    case "out_of_range":
      return "NPC fora de alcance.";
    case "not_interactive":
      return "Este NPC nao possui dialogo.";
    default:
      return "Interacao recusada.";
  }
}

function npcDialogueOptionErrorMessage(error: string | undefined): string {
  switch (error) {
    case "out_of_range":
      return "NPC fora de alcance.";
    case "already_claimed":
      return "Recompensa ja recebida.";
    case "unknown_option":
      return "Opcao de dialogo indisponivel.";
    case "variable_limit":
      return "Variavel de evento atingiu o limite.";
    case "condition_not_met":
      return "Condicao do evento ainda nao foi cumprida.";
    default:
      return "Opcao de dialogo recusada.";
  }
}

function eventOptionMessage(playerName: string, npcName: string, optionId: string, xpReward: number, goldReward: number): string {
  if (optionId === "guide-starter-kit") {
    return `${playerName} recebeu o kit inicial de ${npcName}.`;
  }

  if (optionId === "guide-complete-training") {
    return `${playerName} concluiu o treinamento de ${npcName} e recebeu ${xpReward} XP e ${goldReward} gold.`;
  }

  if (optionId === "guide-training-ground") {
    return `${playerName} viajou para o campo de prova por ${npcName}.`;
  }

  return `${playerName} registrou treino com ${npcName}.`;
}

function handleCastSpell(session: Session, spellId: string, sequence: number): void {
  const now = Date.now();

  if (!session.clientId) {
    return;
  }

  const spell = starterSpells.find((candidate) => candidate.spellId === spellId);

  if (!spell) {
    send(session, {
      type: "server.error",
      code: "unknown_spell",
      message: "Spell indisponivel.",
    });
    return;
  }

  if (sequence <= session.lastSequence || now - (session.lastSpellAt[spellId] ?? 0) < spell.cooldownMs) {
    send(session, {
      type: "server.error",
      code: "spell_cooldown",
      message: "Spell em cooldown.",
    });
    return;
  }

  session.lastSequence = sequence;
  session.lastSpellAt[spellId] = now;

  if (isEntityInSafeZone(session.player, starterMap)) {
    send(session, {
      type: "server.error",
      code: "safe_zone_spell",
      message: "Spell bloqueada em zona segura.",
    });
    return;
  }

  const result = applySpellCastIntent(session.player, spellId, [...npcs.values()], starterMap, getStatsSpellDamageBonus(session.stats));

  if (!result) {
    send(session, {
      type: "server.error",
      code: "spell_no_target",
      message: "Nenhum alvo valido na linha da spell.",
    });
    return;
  }

  npcs.set(result.target.id, result.target);
  broadcastChat("Spell", `${session.player.name} conjurou ${result.spell.name} causando ${result.damage} de dano em ${result.target.name}.`);

  if (result.defeated) {
    handleNpcDefeat(session, result.target);
  }

  broadcastEntities();
}

function handleNpcDefeat(session: Session, npc: EntitySnapshot): void {
  broadcastChat("Combate", `${npc.name} foi derrotado.`);
  const previousLevel = session.progress.level;
  const award = awardNpcDefeat(session.progress, npc);
  session.progress = award.progress;

  if (session.progress.level > previousLevel) {
    session.stats = grantStatPoints(session.stats, session.progress.level - previousLevel);
    sendStats(session);
  }

  sendProgress(session);
  void saveSession(session);
  broadcastChat("Progresso", `${session.player.name} ganhou ${award.xpGained} XP e ${award.goldGained} gold.`);

  if (award.leveledUp) {
    broadcastChat("Progresso", `${session.player.name} avancou para o level ${session.progress.level} e recebeu pontos de atributo.`);
  }

  updateQuestProgressForNpcDefeat(session, npc);
  createDrop(npc);
  scheduleNpcRespawn(npc);
}