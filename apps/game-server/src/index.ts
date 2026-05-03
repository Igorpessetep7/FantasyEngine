import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { createCharacterRepository } from "@fantasy-engine/database";
import { applyAttackIntent, applyBankDepositIntent, applyBankWithdrawIntent, applyItemUseIntent, applyMoveIntent, applyPurchaseIntent, applyQuestNpcDefeat, applySpellCastIntent, awardNpcDefeat, canPickupItem, claimCompletedQuestRewards, createInitialProgress, createInitialQuests, createNpc, createPlayer, starterShopOffers, starterSpells } from "@fantasy-engine/game-rules";
import { starterMap } from "@fantasy-engine/map-format";
import { decodeClientMessage, encodeServerMessage, type EntitySnapshot, type ItemStack, type MapItemSnapshot, type PlayerProgress, type QuestState, type ServerMessage } from "@fantasy-engine/protocol";

const port = Number(process.env.GAME_SERVER_PORT ?? 8787);
const tickMs = 100;
const minMoveMs = 130;
const minAttackMs = 500;
const minPickupMs = 250;
const minShopMs = 250;
const minUseItemMs = 350;
const minBankMs = 250;

interface Session {
  id: string;
  clientId?: string;
  socket: WebSocket;
  player: EntitySnapshot;
  inventory: ItemStack[];
  bank: ItemStack[];
  progress: PlayerProgress;
  quests: QuestState[];
  lastMoveAt: number;
  lastAttackAt: number;
  lastPickupAt: number;
  lastShopAt: number;
  lastUseItemAt: number;
  lastBankAt: number;
  lastSpellAt: Record<string, number>;
  lastSequence: number;
}

const characterRepository = createCharacterRepository();
await characterRepository.initialize();

const sessions = new Map<string, Session>();
const npcs = new Map<string, EntitySnapshot>([
  ["npc-slime-1", createNpc("npc-slime-1", "Slime", 8, 4)],
  ["npc-slime-2", createNpc("npc-slime-2", "Slime", 14, 9)],
  ["npc-guard-1", createNpc("npc-guard-1", "Guardiao", 18, 6)],
]);
const mapItems = new Map<string, MapItemSnapshot>();

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
    inventory: session.inventory,
    bank: session.bank,
    progress: session.progress,
    shopOffers: starterShopOffers,
    quests: session.quests,
    spells: starterSpells,
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
    player: createPlayer(id, `Player-${id.slice(0, 4)}`),
    inventory: [],
    bank: [],
    progress: createInitialProgress(),
    quests: createInitialQuests(),
    lastMoveAt: 0,
    lastAttackAt: 0,
    lastPickupAt: 0,
    lastShopAt: 0,
    lastUseItemAt: 0,
    lastBankAt: 0,
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
    progress: session.progress,
    quests: session.quests,
  });

  session.player = state.player;
  session.inventory = state.inventory;
  session.bank = state.bank;
  session.progress = state.progress;
  session.quests = state.quests.length > 0 ? state.quests : createInitialQuests();

  send(session, {
    type: "world.init",
    selfId: session.id,
    map: starterMap,
    entities: getEntities(),
    mapItems: getMapItems(),
    inventory: session.inventory,
    bank: session.bank,
    progress: session.progress,
    shopOffers: starterShopOffers,
    quests: session.quests,
    spells: starterSpells,
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
  session.player = applyMoveIntent(session.player, direction, starterMap).entity;
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

  const result = applyAttackIntent(session.player, [...npcs.values()]);

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
  const damage = npc.name === "Guardiao" ? 8 : 4;
  session.player = {
    ...session.player,
    hp: Math.max(0, session.player.hp - damage),
  };

  broadcastChat("Combate", `${npc.name} contra-atacou ${session.player.name} causando ${damage} de dano.`);

  if (session.player.hp === 0) {
    session.player = {
      ...session.player,
      hp: session.player.maxHp,
      x: 4,
      y: 4,
      direction: "down",
    };
    broadcastChat("Sistema", `${session.player.name} retornou ao ponto inicial.`);
  }

  void saveSession(session);
}

function scheduleNpcRespawn(npc: EntitySnapshot): void {
  setTimeout(() => {
    npcs.set(npc.id, { ...npc, hp: npc.maxHp });
    broadcastChat("Sistema", `${npc.name} reapareceu.`);
    broadcastEntities();
  }, 5000);
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
  const drop: MapItemSnapshot = {
    id: randomUUID(),
    item: {
      itemId: npc.name === "Guardiao" ? "iron-token" : "slime-gel",
      name: npc.name === "Guardiao" ? "Ficha de Ferro" : "Gel de Slime",
      quantity: npc.name === "Guardiao" ? 2 : 1,
    },
    x: npc.x,
    y: npc.y,
  };

  mapItems.set(drop.id, drop);
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

function sendProgress(session: Session): void {
  send(session, {
    type: "player.progress",
    progress: session.progress,
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
    progress: session.progress,
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

  const rewards = claimCompletedQuestRewards(session.progress, session.inventory, session.quests);
  session.progress = rewards.progress;
  session.inventory = rewards.inventory;
  session.quests = rewards.quests;

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

  const result = applySpellCastIntent(session.player, spellId, [...npcs.values()], starterMap);

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
  const award = awardNpcDefeat(session.progress, npc);
  session.progress = award.progress;
  sendProgress(session);
  void saveSession(session);
  broadcastChat("Progresso", `${session.player.name} ganhou ${award.xpGained} XP e ${award.goldGained} gold.`);

  if (award.leveledUp) {
    broadcastChat("Progresso", `${session.player.name} avancou para o level ${session.progress.level}.`);
  }

  updateQuestProgressForNpcDefeat(session, npc);
  createDrop(npc);
  scheduleNpcRespawn(npc);
}