export type TileType = 'empty' | 'floor' | 'wall' | 'door' | 'artwork' | 'spawn';

export interface TileCell {
  type: TileType;
  artworkId?: string;
  wallFacing?: 'north' | 'south' | 'east' | 'west';
}

export interface GridMap {
  width: number;
  height: number;
  wallHeight: number;
  grid: TileCell[][];
}

export interface ParsedWallSegment {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  normalX: number;
  normalZ: number;
  length: number;
}

export interface ParsedArtworkSlot {
  artworkId: string;
  worldX: number;
  worldZ: number;
  wallFacing: 'north' | 'south' | 'east' | 'west';
  rotation: number;
  normalX: number;
  normalY: number;
  normalZ: number;
}

export interface ParsedDoorway {
  worldX: number;
  worldZ: number;
  orientation: 'horizontal' | 'vertical'; // horizontal = passage along X, vertical = along Z
}

export interface ParsedMap {
  widthMeters: number;
  depthMeters: number;
  wallHeight: number;
  walkableGrid: boolean[][];
  wallSegments: ParsedWallSegment[];
  artworkSlots: ParsedArtworkSlot[];
  doorways: ParsedDoorway[];
  spawnPoint: { x: number; z: number } | null;
}
