import type { GridMap, TileType, ParsedMap, ParsedWallSegment, ParsedArtworkSlot, ParsedDoorway } from '../types/tiled';
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

          artworkSlots.push({
            artworkId: cell.artworkId,
            worldX: col + 0.5,
            worldZ: -(row + 0.5),
            wallFacing: facing,
            rotation,
            normalX: normal.x,
            normalY: 0,
            normalZ: normal.z,
          });
        }
      }
    }

    // Extract wall segments from floor edges
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

  private isWalkable(type: TileType): boolean {
    return type === 'floor' || type === 'door' || type === 'spawn' || type === 'artwork';
  }

  private extractWalls(grid: GridMap['grid'], w: number, h: number, segments: ParsedWallSegment[]): void {
    // Horizontal edges (north/south facing walls)
    for (let row = 0; row <= h; row++) {
      let segStart: number | null = null;
      for (let col = 0; col < w; col++) {
        const above = row > 0 ? grid[row - 1][col].type : 'empty';
        const below = row < h ? grid[row][col].type : 'empty';
        const aboveWalk = this.isWalkable(above);
        const belowWalk = this.isWalkable(below);

        const needsWall = (aboveWalk && !belowWalk) || (!aboveWalk && belowWalk);
        // Don't create walls at door tiles
        const isDoor = (above === 'door' || below === 'door');

        if (needsWall && !isDoor) {
          if (segStart === null) segStart = col;
        } else {
          if (segStart !== null) {
            const nz = aboveWalk ? -1 : 1; // normal points away from walkable
            segments.push({
              startX: segStart,
              startZ: -row,
              endX: col,
              endZ: -row,
              normalX: 0,
              normalZ: nz,
              length: col - segStart,
            });
            segStart = null;
          }
        }
      }
      if (segStart !== null) {
        const above = row > 0 ? grid[row - 1][segStart].type : 'empty';
        const nz = this.isWalkable(above) ? -1 : 1;
        segments.push({
          startX: segStart, startZ: -row,
          endX: w, endZ: -row,
          normalX: 0, normalZ: nz,
          length: w - segStart,
        });
      }
    }

    // Vertical edges (east/west facing walls)
    for (let col = 0; col <= w; col++) {
      let segStart: number | null = null;
      for (let row = 0; row < h; row++) {
        const left = col > 0 ? grid[row][col - 1].type : 'empty';
        const right = col < w ? grid[row][col].type : 'empty';
        const leftWalk = this.isWalkable(left);
        const rightWalk = this.isWalkable(right);

        const needsWall = (leftWalk && !rightWalk) || (!leftWalk && rightWalk);
        const isDoor = (left === 'door' || right === 'door');

        if (needsWall && !isDoor) {
          if (segStart === null) segStart = row;
        } else {
          if (segStart !== null) {
            const nx = leftWalk ? 1 : -1;
            segments.push({
              startX: col, startZ: -segStart,
              endX: col, endZ: -(row),
              normalX: nx, normalZ: 0,
              length: row - segStart,
            });
            segStart = null;
          }
        }
      }
      if (segStart !== null) {
        const left = col > 0 ? grid[segStart][col - 1].type : 'empty';
        const nx = this.isWalkable(left) ? 1 : -1;
        segments.push({
          startX: col, startZ: -segStart,
          endX: col, endZ: -h,
          normalX: nx, normalZ: 0,
          length: h - segStart,
        });
      }
    }
  }

  private detectWallFacing(grid: GridMap['grid'], col: number, row: number, w: number, h: number): 'north' | 'south' | 'east' | 'west' {
    // Check neighbors to find which direction has a wall/empty
    if (row > 0 && (grid[row - 1][col].type === 'wall' || grid[row - 1][col].type === 'empty')) return 'north';
    if (row < h - 1 && (grid[row + 1][col].type === 'wall' || grid[row + 1][col].type === 'empty')) return 'south';
    if (col < w - 1 && (grid[row][col + 1].type === 'wall' || grid[row][col + 1].type === 'empty')) return 'east';
    if (col > 0 && (grid[row][col - 1].type === 'wall' || grid[row][col - 1].type === 'empty')) return 'west';
    return 'north';
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
