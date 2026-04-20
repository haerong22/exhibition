import type { GridMap, ParsedMap, ParsedWallSegment, ParsedArtworkSlot, ParsedDoorway } from '../types/tiled';
import { DEFAULTS } from '../utils/constants';

export class TiledMapParser {
  parse(gridMap: GridMap): ParsedMap {
    const { width, height, grid, wallHeight } = gridMap;

    const walkableGrid: boolean[][] = [];
    const wallSegments: ParsedWallSegment[] = [];
    const artworkSlots: ParsedArtworkSlot[] = [];
    const doorways: ParsedDoorway[] = [];
    const artworkTiles = new Map<string, { artworkId: string; col: number; row: number; wallFacing?: 'north' | 'south' | 'east' | 'west' }[]>();
    let spawnPoint: { x: number; z: number } | null = null;

    // Build walkable grid and collect special tiles
    for (let row = 0; row < height; row++) {
      walkableGrid[row] = [];
      for (let col = 0; col < width; col++) {
        const cell = grid[row][col];
        const walkable = cell.type === 'floor' || cell.type === 'door' || cell.type === 'spawn' || cell.type === 'artwork' || cell.type === 'bench' || cell.type === 'pedestal';
        walkableGrid[row][col] = walkable;

        if (cell.type === 'spawn') {
          spawnPoint = { x: col + 0.5, z: -(row + 0.5) };
        }

        if (cell.type === 'door') {
          // Detect orientation by looking at which axis the passage opens onto floor.
          // A door replaces a wall tile, so along one axis its neighbors are floor-like
          // (the passage direction) and along the other axis they're wall-like (the wall
          // continues, possibly through more adjacent doors).
          const isFloor = (t: string) => t === 'floor' || t === 'spawn' || t === 'artwork';
          const floorN = row > 0 && isFloor(grid[row - 1][col].type);
          const floorS = row < height - 1 && isFloor(grid[row + 1][col].type);
          const floorE = col < width - 1 && isFloor(grid[row][col + 1].type);
          const floorW = col > 0 && isFloor(grid[row][col - 1].type);
          // Passage along X (E-W) → 'horizontal', passage along Z (N-S) → 'vertical'
          // Prefer the axis where a floor neighbor exists; fall back to 'vertical'.
          const orientation: 'horizontal' | 'vertical' =
            (floorE || floorW) ? 'horizontal' : (floorN || floorS) ? 'vertical' : 'vertical';
          doorways.push({
            worldX: col + 0.5,
            worldZ: -(row + 0.5),
            orientation,
          });
        }

        if (cell.type === 'artwork' && cell.artworkId) {
          // Group by instanceId (for 2-tile pairs). Fall back to artworkId if no instanceId.
          const groupKey = cell.instanceId ?? cell.artworkId;
          if (!artworkTiles.has(groupKey)) {
            artworkTiles.set(groupKey, []);
          }
          artworkTiles.get(groupKey)!.push({ artworkId: cell.artworkId, col, row, wallFacing: cell.wallFacing });
        }
      }
    }

    // Build artwork slots from grouped tiles (centroid positioning)
    for (const [, tiles] of artworkTiles) {
      const centerCol = tiles.reduce((s, t) => s + t.col, 0) / tiles.length;
      const centerRow = tiles.reduce((s, t) => s + t.row, 0) / tiles.length;
      const firstTile = tiles[0];
      const facing = firstTile.wallFacing ?? this.detectWallFacing(grid, firstTile.col, firstTile.row, width, height);
      const rotation = this.facingToRotation(facing);
      const normal = this.facingToNormal(facing);

      const wallOffset = 0.48;
      let ax = centerCol + 0.5;
      let az = -(centerRow + 0.5);
      if (facing === 'south') az += wallOffset;
      if (facing === 'north') az -= wallOffset;
      if (facing === 'west') ax += wallOffset;
      if (facing === 'east') ax -= wallOffset;

      artworkSlots.push({
        artworkId: firstTile.artworkId,
        worldX: ax,
        worldZ: az,
        wallFacing: facing,
        rotation,
        normalX: normal.x,
        normalY: 0,
        normalZ: normal.z,
      });
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
    // Rotation around Y so that a PlaneGeometry's default +Z normal points in the facing direction.
    // R_y(θ) applied to (0,0,1): θ=0→+Z, θ=π→-Z, θ=+π/2→+X, θ=-π/2→-X.
    switch (facing) {
      case 'north': return 0;
      case 'south': return Math.PI;
      case 'east': return Math.PI / 2;
      case 'west': return -Math.PI / 2;
      default: return 0;
    }
  }

  private facingToNormal(facing: string): { x: number; z: number } {
    switch (facing) {
      case 'north': return { x: 0, z: 1 };
      case 'south': return { x: 0, z: -1 };
      case 'east': return { x: 1, z: 0 };
      case 'west': return { x: -1, z: 0 };
      default: return { x: 0, z: 1 };
    }
  }
}
