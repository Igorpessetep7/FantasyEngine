import type { Direction, MapSnapshot, TileAttribute } from "@fantasy-engine/protocol";

const width = 24;
const height = 16;
const size = width * height;

const ground = Array.from({ length: size }, (_, index) => {
  const x = index % width;
  const y = Math.floor(index / width);

  if (x === 4 && y === 4) {
    return 6;
  }

  if (x === 13 && y === 4) {
    return 4;
  }

  if (x === 3 && y === 4) {
    return 5;
  }

  if (x === 7 && y === 4) {
    return 7;
  }

  if (x === 5 && y === 4) {
    return 8;
  }

  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
    return 2;
  }

  if ((x + y) % 9 === 0) {
    return 1;
  }

  return 0;
});

const blocked = Array.from({ length: size }, (_, index) => {
  const x = index % width;
  const y = Math.floor(index / width);

  return x === 0 || y === 0 || x === width - 1 || y === height - 1 || (x === 10 && y > 3 && y < 12);
});

const objects = Array.from({ length: size }, (_, index) => {
  const x = index % width;
  const y = Math.floor(index / width);

  return x === 10 && y > 3 && y < 12 ? 3 : 0;
});

const attributes: TileAttribute[] = Array.from({ length: size }, (_, index) => {
  const x = index % width;
  const y = Math.floor(index / width);

  if (x === 4 && y === 4) {
    return {
      kind: "spawn",
      label: "Entrada do Campo",
      direction: "down",
    };
  }

  if (x === 13 && y === 4) {
    return {
      kind: "warp",
      label: "Retorno ao Guia",
      target: { x: 6, y: 5, direction: "left" },
    };
  }

  if (x === 3 && y === 4) {
    return {
      kind: "damage",
      label: "Espinhos de Treino",
      damage: 12,
    };
  }

  if (x === 7 && y === 4) {
    return {
      kind: "safeZone",
      label: "Zona Segura do Campo",
    };
  }

  if (x === 5 && y === 4) {
    return {
      kind: "heal",
      label: "Fonte de Treino",
      amount: 18,
    };
  }

  return { kind: "none" };
});

export const starterMap: MapSnapshot = {
  id: "starter-field",
  name: "Campo Inicial",
  width,
  height,
  tileSize: 32,
  layers: [
    { id: "ground", name: "Ground", tiles: ground },
    { id: "objects", name: "Objects", tiles: objects },
  ],
  blocked,
  attributes,
};

export function tileIndex(map: MapSnapshot, x: number, y: number): number {
  return y * map.width + x;
}

export function isInsideMap(map: MapSnapshot, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function isBlocked(map: MapSnapshot, x: number, y: number): boolean {
  if (!isInsideMap(map, x, y)) {
    return true;
  }

  return map.blocked[tileIndex(map, x, y)] ?? true;
}

export function getTileAttribute(map: MapSnapshot, x: number, y: number): TileAttribute {
  if (!isInsideMap(map, x, y)) {
    return { kind: "none" };
  }

  return map.attributes[tileIndex(map, x, y)] ?? { kind: "none" };
}

export function findSpawnAttribute(map: MapSnapshot): { x: number; y: number; direction: Direction; label: string } {
  for (let index = 0; index < map.attributes.length; index += 1) {
    const attribute = map.attributes[index];

    if (attribute?.kind === "spawn") {
      return {
        x: index % map.width,
        y: Math.floor(index / map.width),
        direction: attribute.direction,
        label: attribute.label,
      };
    }
  }

  return { x: 1, y: 1, direction: "down", label: "Spawn Padrao" };
}
