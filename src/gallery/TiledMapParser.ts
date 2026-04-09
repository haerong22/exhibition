import type { GridMap, ParsedMap, ParsedWallSegment, ParsedArtworkSlot, ParsedDoorway } from '../types/tiled';
import { DEFAULTS } from '../utils/constants';

export class TiledMapParser {
  parse(gridMap: GridMap): ParsedMap {
    const { width, height, grid, wallHeight } = gridMap;

    const walkableGrid: boolean[][] = [];
    const wallSegments: ParsedWallSegment[] = [];
    const artworkSlots: ParsedArtworkSlot[] = [];
    const doorways: ParsedDoorway[] = [];
    let spawnPoint: { x: number; z: number } | null = null;

    // Build walkable grid and collect special tiles
    for (let row = 0; row < height; row++) {
      walkableGrid[row] = [];
      for (let col = 0; col < width; col++) {
        const cell = grid[row][col];
        const walkable = cell.type === 'floor' || cell.type === 'door' || cell.type === 'spawn' || cell.type === 'artwork';
        walkableGrid[row][col] = walkable;

        if (cell.type === 'spawn') {
          spawnPoint = { x: col + 0.5, z: -(row + 0.5) };
        }

        if (cell.type === 'door') {
          // Detect orientation: if wall/empty is above/below → horizontal passage, else vertical
          const leftWall = col > 0 && (grid[row][col - 1].type === 'wall' || grid[row][col - 1].type === 'empty');
          const rightWall = col < width - 1 && (grid[row][col + 1].type === 'wall' || grid[row][col + 1].type === 'empty');
          // If walls are on left/right → passage goes along Z (vertical), pillars on X sides
          // If walls are on top/bottom → passage goes along X (horizontal), pillars on Z sides
          const orientation = (leftWall || rightWall) ? 'vertical' : 'horizontal';
          doorways.push({
            worldX: col + 0.5,
            worldZ: -(row + 0.5),
            orientation,
          });
        }

        if (cell.type === 'artwork' && cell.artworkId) {
          const facing = cell.wallFacing ?? this.detectWallFacing(grid, col, row, width, height);
          const rotation = this.facingToRotation(facing);
          const normal = this.facingToNormal(facing);

          // Push artwork against the wall (offset toward the wall direction)
          const wallOffset = 0.48;
          let ax = col + 0.5;
          let az = -(row + 0.5);
          if (facing === 'south') az += wallOffset;  // wall is north, push toward north
          if (facing === 'north') az -= wallOffset;   // wall is south, push toward south
          if (facing === 'west') ax += wallOffset;    // wall is east, push toward east
          if (facing === 'east') ax -= wallOffset;    // wall is west, push toward west

          artworkSlots.push({
            artworkId: cell.artworkId,
            worldX: ax,
            worldZ: az,
            wallFacing: facing,
            rotation,
            normalX: normal.x,
            normalY: 0,
            normalZ: normal.z,
          });
        }
      }
    }

    // Extract walls from explicit wall tiles
    this.extractWalls(grid, width, height, wallSegments);

    return {
      widthMeters: width,
      depthMeters: height,
      wallHeight: wallHeight ?? DEFAULTS.WALL_HEIGHT,
      walkableGrid,
      wallSegments,
      artworkSlots,
      doorways,
      spawnPoint,
    };
  }

  private extractWalls(grid: GridMap['grid'], w: number, h: number, segments: ParsedWallSegment[]): void {
    // For each wall tile, create wall planes on its edges that face walkable/empty neighbors
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        if (grid[row][col].type !== 'wall') continue;

        const x = col;
        const z = -row;

        // Check each neighbor — if not a wall tile, place a wall face on that edge
        // North edge (row-1)
        if (row === 0 || grid[row - 1][col].type !== 'wall') {
          segments.push({ startX: x, startZ: z, endX: x + 1, endZ: z, normalX: 0, normalZ: 1, length: 1 });
        }
        // South edge (row+1)
        if (row === h - 1 || grid[row + 1][col].type !== 'wall') {
          segments.push({ startX: x, startZ: z - 1, endX: x + 1, endZ: z - 1, normalX: 0, normalZ: -1, length: 1 });
        }
        // West edge (col-1)
        if (col === 0 || grid[row][col - 1].type !== 'wall') {
          segments.push({ startX: x, startZ: z, endX: x, endZ: z - 1, normalX: -1, normalZ: 0, length: 1 });
        }
        // East edge (col+1)
        if (col === w - 1 || grid[row][col + 1].type !== 'wall') {
          segments.push({ startX: x + 1, startZ: z, endX: x + 1, endZ: z - 1, normalX: 1, normalZ: 0, length: 1 });
        }
      }
    }
  }

  private detectWallFacing(grid: GridMap['grid'], col: number, row: number, w: number, h: number): 'north' | 'south' | 'east' | 'west' {
    // Artwork faces AWAY from the wall (into the room)
    // If wall is above (north) → artwork faces south
    if (row > 0 && (grid[row - 1][col].type === 'wall' || grid[row - 1][col].type === 'empty')) return 'south';
    if (row < h - 1 && (grid[row + 1][col].type === 'wall' || grid[row + 1][col].type === 'empty')) return 'north';
    if (col < w - 1 && (grid[row][col + 1].type === 'wall' || grid[row][col + 1].type === 'empty')) return 'west';
    if (col > 0 && (grid[row][col - 1].type === 'wall' || grid[row][col - 1].type === 'empty')) return 'east';
    return 'south';
  }

  private facingToRotation(facing: string): number {
    switch (facing) {
      case 'north': return 0;
      case 'south': return Math.PI;
      case 'east': return -Math.PI / 2;
      case 'west': return Math.PI / 2;
      default: return 0;
    }
  }

  private facingToNormal(facing: string): { x: number; z: number } {
    switch (facing) {
      case 'north': return { x: 0, z: 1 };
      case 'south': return { x: 0, z: -1 };
      case 'east': return { x: -1, z: 0 };
      case 'west': return { x: 1, z: 0 };
      default: return { x: 0, z: 1 };
    }
  }
}
