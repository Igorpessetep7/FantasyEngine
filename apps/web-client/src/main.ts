import "./style.css";
import { Application, Container, Graphics, Text } from "pixi.js";
import { decodeServerMessage, type ClassId, type CraftingRecipe, type EntitySnapshot, type EquipmentSlot, type EquipmentState, type ItemStack, type MapItemSnapshot, type MapSnapshot, type NpcDialogue, type PlayerClass, type PlayerEventFlags, type PlayerEventVariables, type PlayerProgress, type PlayerStats, type QuestState, type ResourceSnapshot, type ShopOffer, type SpellDefinition, type StatName } from "@fantasy-engine/protocol";

const gameElement = getElement("game");
const statusElement = getElement("status");
const chatLogElement = getElement("chat-log");
const inventoryListElement = getElement("inventory-list");
const bankListElement = getElement("bank-list");
const shopListElement = getElement("shop-list");
const questListElement = getElement("quest-list");
const spellListElement = getElement("spell-list");
const craftingListElement = getElement("crafting-list");
const equipmentListElement = getElement("equipment-list");
const statsListElement = getElement("stats-list");
const classListElement = getElement("class-list");
const dialogueListElement = getElement("dialogue-list");
const levelLabelElement = getElement("level-label");
const goldLabelElement = getElement("gold-label");
const xpLabelElement = getElement("xp-label");
const xpFillElement = getElement("xp-fill");
const chatFormElement = getElement("chat-form") as HTMLFormElement;
const chatInputElement = getElement("chat-input") as HTMLInputElement;

let socket: WebSocket | undefined;
let sequence = 0;
let selfId = "";
let mapSnapshot: MapSnapshot | undefined;
const entitySnapshots = new Map<string, EntitySnapshot>();
const mapItemSnapshots = new Map<string, MapItemSnapshot>();
const resourceSnapshots = new Map<string, ResourceSnapshot>();
let inventory: ItemStack[] = [];
let bank: ItemStack[] = [];
let equipment: EquipmentState = { weapon: null };
let progress: PlayerProgress = { level: 1, xp: 0, xpToNext: 50, gold: 0 };
let stats: PlayerStats = { strength: 1, intelligence: 1, vitality: 1, points: 0 };
let eventFlags: PlayerEventFlags = {};
let eventVariables: PlayerEventVariables = {};
let playerClass: PlayerClass | null = null;
let classOptions: PlayerClass[] = [];
let currentDialogue: NpcDialogue | undefined;
let shopOffers: ShopOffer[] = [];
let quests: QuestState[] = [];
let spells: SpellDefinition[] = [];
let craftingRecipes: CraftingRecipe[] = [];

const app = new Application();
const world = new Container();
const tileLayer = new Container();
const resourceLayer = new Container();
const mapItemLayer = new Container();
const entityLayer = new Container();

await app.init({
  width: 960,
  height: 640,
  background: "#0f1712",
  antialias: false,
  resizeTo: gameElement,
});

gameElement.appendChild(app.canvas);
world.addChild(tileLayer, resourceLayer, mapItemLayer, entityLayer);
app.stage.addChild(world);

connect();
bindInput();

function connect(): void {
  socket = new WebSocket(import.meta.env.VITE_GAME_SERVER_URL ?? "ws://localhost:8787");

  socket.addEventListener("open", () => {
    statusElement.textContent = "Online";
    send({ type: "client.hello", clientId: getClientId(), name: getHeroName() });
  });

  socket.addEventListener("close", () => {
    statusElement.textContent = "Reconectando...";
    setTimeout(connect, 1200);
  });

  socket.addEventListener("message", (event) => {
    const message = decodeServerMessage(event.data);

    switch (message.type) {
      case "world.init":
        selfId = message.selfId;
        mapSnapshot = message.map;
        setEntities(message.entities);
        setMapItems(message.mapItems);
        setResources(message.resources);
        inventory = message.inventory;
        bank = message.bank;
        equipment = message.equipment;
        progress = message.progress;
        stats = message.stats;
        eventFlags = message.eventFlags;
        eventVariables = message.eventVariables;
        playerClass = message.playerClass;
        classOptions = message.classOptions;
        shopOffers = message.shopOffers;
        quests = message.quests;
        spells = message.spells;
        craftingRecipes = message.craftingRecipes;
        drawMap(message.map);
        drawResources();
        drawMapItems();
        drawEntities();
        drawInventory();
        drawBank();
        drawEquipment();
        drawClass();
        drawDialogue();
        drawStats();
        drawProgress();
        drawShop();
        drawQuests();
        drawSpells();
        drawCrafting();
        return;
      case "world.entities":
        setEntities(message.entities);
        drawEntities();
        return;
      case "world.mapItems":
        setMapItems(message.mapItems);
        drawMapItems();
        return;
      case "world.resources":
        setResources(message.resources);
        drawResources();
        return;
      case "inventory.update":
        inventory = message.inventory;
        drawInventory();
        drawCrafting();
        return;
      case "equipment.update":
        equipment = message.equipment;
        drawEquipment();
        return;
      case "bank.update":
        bank = message.bank;
        drawBank();
        return;
      case "player.progress":
        progress = message.progress;
        drawProgress();
        drawShop();
        return;
      case "player.stats":
        stats = message.stats;
        drawStats();
        return;
      case "player.eventFlags":
        eventFlags = message.eventFlags;
        drawDialogue();
        return;
      case "player.eventVariables":
        eventVariables = message.eventVariables;
        drawDialogue();
        return;
      case "player.class":
        playerClass = message.playerClass;
        stats = message.stats;
        drawClass();
        drawStats();
        return;
      case "npc.dialogue":
        currentDialogue = message.dialogue;
        drawDialogue();
        return;
      case "shop.offers":
        shopOffers = message.shopOffers;
        drawShop();
        return;
      case "quest.update":
        quests = message.quests;
        drawQuests();
        return;
      case "spell.list":
        spells = message.spells;
        drawSpells();
        return;
      case "craft.list":
        craftingRecipes = message.craftingRecipes;
        drawCrafting();
        return;
      case "chat.message":
        appendChat(message.from, message.text);
        return;
      case "server.error":
        appendChat("Servidor", message.message);
        return;
    }
  });
}

function bindInput(): void {
  window.addEventListener("keydown", (event) => {
    if (document.activeElement === chatInputElement) {
      return;
    }

    const direction = keyToDirection(event.key);

    if (!direction) {
      if (event.code === "Space") {
        event.preventDefault();
        sequence += 1;
        send({ type: "input.attack", sequence });
      }

      if (event.key === "e" || event.key === "E") {
        event.preventDefault();
        pickupNearestItem();
      }

      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        gatherNearestResource();
      }

      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        interactNearestNpc();
      }

      if (event.key === "1" && spells[0]) {
        event.preventDefault();
        castSpell(spells[0].spellId);
      }

      return;
    }

    event.preventDefault();
    sequence += 1;
    send({ type: "input.move", direction, sequence });
  });

  chatFormElement.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = chatInputElement.value.trim();

    if (text.length === 0) {
      return;
    }

    send({ type: "chat.send", text });
    chatInputElement.value = "";
  });
}

function drawMap(map: MapSnapshot): void {
  tileLayer.removeChildren();

  for (const layer of map.layers) {
    for (let index = 0; index < layer.tiles.length; index += 1) {
      const tile = layer.tiles[index] ?? 0;

      if (tile === 0 && layer.id !== "ground") {
        continue;
      }

      const x = index % map.width;
      const y = Math.floor(index / map.width);
      const graphic = new Graphics();
      graphic.rect(x * map.tileSize, y * map.tileSize, map.tileSize, map.tileSize);
      graphic.fill(tileColor(tile));

      if (layer.id === "ground") {
        graphic.stroke({ color: 0x26342d, width: 1, alpha: 0.55 });
      }

      tileLayer.addChild(graphic);
    }
  }

  centerWorld(map);
}

function drawEntities(): void {
  if (!mapSnapshot) {
    return;
  }

  entityLayer.removeChildren();

  for (const entity of entitySnapshots.values()) {
    const graphic = new Graphics();
    const isSelf = entity.id === selfId;
    const isNpc = entity.kind === "npc";
    const isFriendlyNpc = isNpc && entity.disposition === "friendly";
    const x = entity.x * mapSnapshot.tileSize;
    const y = entity.y * mapSnapshot.tileSize;

    graphic.roundRect(x + 5, y + 5, mapSnapshot.tileSize - 10, mapSnapshot.tileSize - 10, 5);
    graphic.fill(isFriendlyNpc ? 0x9fd8d5 : isNpc ? 0xd86958 : isSelf ? 0x65d98b : 0x6aa2ff);
    graphic.stroke({ color: 0x0b100d, width: 2 });

    const hpBack = new Graphics();
    hpBack.rect(x + 4, y + mapSnapshot.tileSize - 5, mapSnapshot.tileSize - 8, 3);
    hpBack.fill(0x1b241f);

    const hpFill = new Graphics();
    hpFill.rect(x + 4, y + mapSnapshot.tileSize - 5, (mapSnapshot.tileSize - 8) * (entity.hp / entity.maxHp), 3);
    hpFill.fill(entity.hp > entity.maxHp * 0.35 ? 0x7ee08f : 0xf1ba55);

    const label = new Text({
      text: entity.name,
      style: {
        fill: "#effff5",
        fontSize: 11,
        stroke: { color: "#101612", width: 3 },
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(x + mapSnapshot.tileSize / 2, y + 2);

    entityLayer.addChild(graphic, hpBack, hpFill, label);
  }
}

function centerWorld(map: MapSnapshot): void {
  const mapWidth = map.width * map.tileSize;
  const mapHeight = map.height * map.tileSize;
  world.position.set(Math.max(16, (app.screen.width - mapWidth) / 2), Math.max(16, (app.screen.height - mapHeight) / 2));
}

function setEntities(entities: EntitySnapshot[]): void {
  entitySnapshots.clear();

  for (const entity of entities) {
    entitySnapshots.set(entity.id, entity);
  }
}

function appendChat(from: string, text: string): void {
  const line = document.createElement("div");
  line.textContent = `${from}: ${text}`;
  chatLogElement.appendChild(line);
  chatLogElement.scrollTop = chatLogElement.scrollHeight;
}

function send(message: object): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function keyToDirection(key: string): "up" | "down" | "left" | "right" | undefined {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
      return "down";
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
    default:
      return undefined;
  }
}

function tileColor(tile: number): number {
  switch (tile) {
    case 1:
      return 0x295f45;
    case 2:
      return 0x4f574d;
    case 3:
      return 0x7a6240;
    default:
      return 0x2f7d4d;
  }
}

function getElement(id: string): HTMLElement {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Elemento #${id} nao encontrado.`);
  }

  return element;
}

function drawMapItems(): void {
  if (!mapSnapshot) {
    return;
  }

  mapItemLayer.removeChildren();

  for (const mapItem of mapItemSnapshots.values()) {
    const x = mapItem.x * mapSnapshot.tileSize;
    const y = mapItem.y * mapSnapshot.tileSize;
    const graphic = new Graphics();
    graphic.roundRect(x + 9, y + 10, mapSnapshot.tileSize - 18, mapSnapshot.tileSize - 18, 4);
    graphic.fill(0xf0c35b);
    graphic.stroke({ color: 0x2d2410, width: 2 });
    mapItemLayer.addChild(graphic);
  }
}

function setMapItems(mapItems: MapItemSnapshot[]): void {
  mapItemSnapshots.clear();

  for (const mapItem of mapItems) {
    mapItemSnapshots.set(mapItem.id, mapItem);
  }
}

function drawResources(): void {
  if (!mapSnapshot) {
    return;
  }

  resourceLayer.removeChildren();

  for (const resource of resourceSnapshots.values()) {
    const x = resource.x * mapSnapshot.tileSize;
    const y = resource.y * mapSnapshot.tileSize;
    const graphic = new Graphics();

    if (resource.kind === "tree") {
      graphic.circle(x + mapSnapshot.tileSize / 2, y + 14, 12);
      graphic.fill(resource.depleted ? 0x566158 : 0x3f9f5f);
      graphic.rect(x + mapSnapshot.tileSize / 2 - 3, y + 19, 6, 18);
      graphic.fill(resource.depleted ? 0x51483a : 0x7a6240);
    } else {
      graphic.roundRect(x + 7, y + 13, mapSnapshot.tileSize - 14, mapSnapshot.tileSize - 20, 5);
      graphic.fill(resource.depleted ? 0x4b5553 : 0x8aa4a2);
      graphic.stroke({ color: 0x1a2320, width: 2 });
    }

    if (!resource.depleted) {
      const hpBack = new Graphics();
      hpBack.rect(x + 7, y + mapSnapshot.tileSize - 7, mapSnapshot.tileSize - 14, 3);
      hpBack.fill(0x1b241f);

      const hpFill = new Graphics();
      hpFill.rect(x + 7, y + mapSnapshot.tileSize - 7, (mapSnapshot.tileSize - 14) * (resource.hp / resource.maxHp), 3);
      hpFill.fill(resource.kind === "tree" ? 0x90df7c : 0x9fd8d5);
      resourceLayer.addChild(graphic, hpBack, hpFill);
    } else {
      resourceLayer.addChild(graphic);
    }
  }
}

function setResources(resources: ResourceSnapshot[]): void {
  resourceSnapshots.clear();

  for (const resource of resources) {
    resourceSnapshots.set(resource.id, resource);
  }
}

function gatherNearestResource(): void {
  const self = entitySnapshots.get(selfId);

  if (!self) {
    return;
  }

  const nearest = [...resourceSnapshots.values()].find((resource) => !resource.depleted && Math.abs(self.x - resource.x) + Math.abs(self.y - resource.y) <= 1);

  if (!nearest) {
    appendChat("Sistema", "Nenhum recurso ao alcance.");
    return;
  }

  sequence += 1;
  send({ type: "input.gatherResource", resourceId: nearest.id, sequence });
}

function interactNearestNpc(): void {
  const self = entitySnapshots.get(selfId);

  if (!self) {
    return;
  }

  const nearest = [...entitySnapshots.values()].find((entity) => entity.kind === "npc" && Math.abs(self.x - entity.x) + Math.abs(self.y - entity.y) <= 1);

  if (!nearest) {
    appendChat("Sistema", "Nenhum NPC ao alcance.");
    return;
  }

  sequence += 1;
  send({ type: "input.interactNpc", npcId: nearest.id, sequence });
}

function drawDialogue(): void {
  dialogueListElement.replaceChildren();

  if (!currentDialogue) {
    const empty = document.createElement("span");
    empty.textContent = "Nenhum dialogo ativo";
    dialogueListElement.appendChild(empty);
    return;
  }

  const entry = document.createElement("div");
  entry.className = "dialogue-entry";

  const speaker = document.createElement("span");
  speaker.textContent = currentDialogue.npcName;

  const text = document.createElement("span");
  text.textContent = currentDialogue.text;

  entry.append(speaker, text);

  for (const option of currentDialogue.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.label;
    button.disabled = option.disabled;
    button.addEventListener("click", () => chooseNpcDialogueOption(currentDialogue?.npcId, option.optionId));
    entry.appendChild(button);
  }

  const trainingMarks = eventVariables["guide.trainingMarks"];

  if (typeof trainingMarks === "number" && !currentDialogue.text.startsWith("Treino registrado")) {
    const variableLine = document.createElement("span");
    variableLine.textContent = `Treino registrado: ${trainingMarks}/3`;
    entry.appendChild(variableLine);
  }

  dialogueListElement.appendChild(entry);
}

function chooseNpcDialogueOption(npcId: string | undefined, optionId: string): void {
  if (!npcId) {
    return;
  }

  sequence += 1;
  send({ type: "input.chooseNpcDialogueOption", npcId, optionId, sequence });
}

function pickupNearestItem(): void {
  const self = entitySnapshots.get(selfId);

  if (!self) {
    return;
  }

  const nearest = [...mapItemSnapshots.values()].find((mapItem) => Math.abs(self.x - mapItem.x) + Math.abs(self.y - mapItem.y) <= 1);

  if (!nearest) {
    appendChat("Sistema", "Nenhum item ao alcance.");
    return;
  }

  sequence += 1;
  send({ type: "input.pickup", itemInstanceId: nearest.id, sequence });
}

function drawInventory(): void {
  inventoryListElement.replaceChildren();

  if (inventory.length === 0) {
    const empty = document.createElement("span");
    empty.textContent = "Vazio";
    inventoryListElement.appendChild(empty);
    return;
  }

  for (const item of inventory) {
    const row = document.createElement("div");
    row.className = "inventory-item";

    const label = document.createElement("span");
    label.textContent = `${item.quantity}x ${item.name}`;

    const actions = document.createElement("div");
    actions.className = "item-actions";

    if (item.itemId === "small-potion") {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Usar";
      button.addEventListener("click", () => {
        sequence += 1;
        send({ type: "input.useItem", itemId: item.itemId, sequence });
      });
      actions.appendChild(button);
    }

    if (isEquippable(item.itemId)) {
      const equipButton = document.createElement("button");
      equipButton.type = "button";
      equipButton.textContent = "Equipar";
      equipButton.addEventListener("click", () => equipItem(item.itemId));
      actions.appendChild(equipButton);
    }

    const depositButton = document.createElement("button");
    depositButton.type = "button";
    depositButton.textContent = "Banco";
    depositButton.addEventListener("click", () => transferBank("deposit", item.itemId));
    actions.appendChild(depositButton);

    row.append(label, actions);

    inventoryListElement.appendChild(row);
  }
}

function drawBank(): void {
  bankListElement.replaceChildren();

  if (bank.length === 0) {
    const empty = document.createElement("span");
    empty.textContent = "Vazio";
    bankListElement.appendChild(empty);
    return;
  }

  for (const item of bank) {
    const row = document.createElement("div");
    row.className = "bank-item";

    const label = document.createElement("span");
    label.textContent = `${item.quantity}x ${item.name}`;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Sacar";
    button.addEventListener("click", () => transferBank("withdraw", item.itemId));

    row.append(label, button);
    bankListElement.appendChild(row);
  }
}

function drawEquipment(): void {
  equipmentListElement.replaceChildren();

  const row = document.createElement("div");
  row.className = "equipment-item";

  const label = document.createElement("span");
  label.textContent = equipment.weapon ? `Arma: ${equipment.weapon.item.name} (+${equipment.weapon.attackBonus} dano)` : "Arma: Vazio";

  if (equipment.weapon) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Remover";
    button.addEventListener("click", () => unequipItem("weapon"));
    row.append(label, button);
  } else {
    row.append(label);
  }

  equipmentListElement.appendChild(row);
}

function drawClass(): void {
  classListElement.replaceChildren();

  if (playerClass) {
    const selected = document.createElement("div");
    selected.className = "class-entry selected";
    selected.textContent = `${playerClass.name}: ${playerClass.description}`;
    classListElement.appendChild(selected);
    return;
  }

  for (const option of classOptions) {
    const row = document.createElement("div");
    row.className = "class-entry";

    const info = document.createElement("span");
    info.textContent = `${option.name}: ${formatClassBonuses(option)}`;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Escolher";
    button.title = option.description;
    button.addEventListener("click", () => chooseClass(option.classId));

    row.append(info, button);
    classListElement.appendChild(row);
  }
}

function drawStats(): void {
  statsListElement.replaceChildren();

  const points = document.createElement("div");
  points.textContent = `Pontos: ${stats.points}`;
  statsListElement.appendChild(points);

  drawStatRow("Forca", "strength", stats.strength, `+${stats.strength * 2} dano fisico`);
  drawStatRow("Inteligencia", "intelligence", stats.intelligence, `+${stats.intelligence * 2} dano spell`);
  drawStatRow("Vitalidade", "vitality", stats.vitality, `${100 + (stats.vitality - 1) * 10} HP base`);
}

function drawStatRow(labelText: string, stat: StatName, value: number, detailText: string): void {
  const row = document.createElement("div");
  row.className = "stat-row";

  const label = document.createElement("span");
  label.textContent = `${labelText}: ${value} (${detailText})`;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "+";
  button.disabled = stats.points <= 0;
  button.addEventListener("click", () => allocateStat(stat));

  row.append(label, button);
  statsListElement.appendChild(row);
}

function allocateStat(stat: StatName): void {
  sequence += 1;
  send({ type: "input.allocateStat", stat, sequence });
}

function chooseClass(classId: ClassId): void {
  sequence += 1;
  send({ type: "input.chooseClass", classId, sequence });
}

function formatClassBonuses(playerClassOption: PlayerClass): string {
  const bonuses = playerClassOption.statBonuses;
  return `Forca +${bonuses.strength}, Int +${bonuses.intelligence}, Vit +${bonuses.vitality}`;
}

function isEquippable(itemId: string): boolean {
  return itemId === "training-sword";
}

function equipItem(itemId: string): void {
  sequence += 1;
  send({ type: "input.equipItem", itemId, sequence });
}

function unequipItem(slot: EquipmentSlot): void {
  sequence += 1;
  send({ type: "input.unequipItem", slot, sequence });
}

function transferBank(action: "deposit" | "withdraw", itemId: string): void {
  sequence += 1;
  send({ type: action === "deposit" ? "input.bankDeposit" : "input.bankWithdraw", itemId, quantity: 1, sequence });
}

function drawProgress(): void {
  levelLabelElement.textContent = `Level ${progress.level}`;
  goldLabelElement.textContent = `${progress.gold} gold`;
  xpLabelElement.textContent = `${progress.xp} / ${progress.xpToNext} XP`;
  xpFillElement.style.width = `${Math.min(100, (progress.xp / progress.xpToNext) * 100)}%`;
}

function drawShop(): void {
  shopListElement.replaceChildren();

  for (const offer of shopOffers) {
    const row = document.createElement("div");
    row.className = "shop-offer";

    const label = document.createElement("span");
    label.textContent = `${offer.item.name} - ${offer.priceGold} gold`;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Comprar";
    button.disabled = progress.gold < offer.priceGold;
    button.addEventListener("click", () => {
      sequence += 1;
      send({ type: "input.shopBuy", itemId: offer.item.itemId, sequence });
    });

    row.append(label, button);
    shopListElement.appendChild(row);
  }
}

function drawQuests(): void {
  questListElement.replaceChildren();

  if (quests.length === 0) {
    const empty = document.createElement("span");
    empty.textContent = "Nenhuma quest";
    questListElement.appendChild(empty);
    return;
  }

  for (const quest of quests) {
    const entry = document.createElement("div");
    entry.className = "quest-entry";

    const title = document.createElement("span");
    title.textContent = quest.title;

    const progressLine = document.createElement("span");
    progressLine.textContent = `${quest.description} ${quest.progress}/${quest.target.required}`;

    const reward = document.createElement("span");
    reward.textContent = quest.status === "claimed" ? "Recompensa recebida" : `Recompensa: ${quest.reward.xp} XP, ${quest.reward.gold} gold`;

    entry.append(title, progressLine, reward);
    questListElement.appendChild(entry);
  }
}

function drawSpells(): void {
  spellListElement.replaceChildren();

  for (const spell of spells) {
    const row = document.createElement("div");
    row.className = "spell-entry";

    const label = document.createElement("span");
    label.textContent = `${spell.name} - ${spell.damage} dano`;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Cast";
    button.title = spell.description;
    button.addEventListener("click", () => castSpell(spell.spellId));

    row.append(label, button);
    spellListElement.appendChild(row);
  }
}

function drawCrafting(): void {
  craftingListElement.replaceChildren();

  for (const recipe of craftingRecipes) {
    const row = document.createElement("div");
    row.className = "crafting-recipe";

    const info = document.createElement("div");
    const title = document.createElement("span");
    title.textContent = `${recipe.output.quantity}x ${recipe.output.name}`;

    const ingredients = document.createElement("span");
    ingredients.textContent = recipe.ingredients.map((item) => `${item.quantity}x ${item.name}`).join(" + ");

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Criar";
    button.title = recipe.description;
    button.disabled = !canCraft(recipe);
    button.addEventListener("click", () => craftItem(recipe.recipeId));

    info.append(title, ingredients);
    row.append(info, button);
    craftingListElement.appendChild(row);
  }
}

function canCraft(recipe: CraftingRecipe): boolean {
  return recipe.ingredients.every((ingredient) => {
    const item = inventory.find((candidate) => candidate.itemId === ingredient.itemId);
    return item !== undefined && item.quantity >= ingredient.quantity;
  });
}

function craftItem(recipeId: string): void {
  sequence += 1;
  send({ type: "input.craftItem", recipeId, sequence });
}

function castSpell(spellId: string): void {
  sequence += 1;
  send({ type: "input.castSpell", spellId, sequence });
}

function getClientId(): string {
  const storageKey = "fantasy-engine.client-id";
  const existing = localStorage.getItem(storageKey);

  if (existing) {
    return existing;
  }

  const created = crypto.randomUUID();
  localStorage.setItem(storageKey, created);
  return created;
}

function getHeroName(): string {
  const storageKey = "fantasy-engine.hero-name";
  const existing = localStorage.getItem(storageKey);

  if (existing) {
    return existing;
  }

  const created = `Hero-${Math.floor(Math.random() * 9999)}`;
  localStorage.setItem(storageKey, created);
  return created;
}