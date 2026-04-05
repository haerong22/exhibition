export class TiledCollision {
  private grid: boolean[][];
  private mapWidth: number;
  private mapDepth: number;
  private radius: number;

  constructor(walkableGrid: boolean[][], mapWidth: number, mapDepth: number, radius = 0.35) {
    this.grid = walkableGrid;
    this.mapWidth = mapWidth;
    this.mapDepth = mapDepth;
    this.radius = radius;
  }

  // Convert world coords to grid coords
  // Grid: row 0 = top of map, col 0 = left
  // World: X goes right, Z goes negative (row 0 is near Z=0, row N is near Z=-N)
  private toGrid(worldX: number, worldZ: number): { col: number; row: number } {
    return {
      col: Math.floor(worldX),
      row: Math.floor(-worldZ),
    };
  }

  isWalkable(worldX: number, worldZ: number): boolean {
    const { col, row } = this.toGrid(worldX, worldZ);
    if (row < 0 || row >= this.mapDepth || col < 0 || col >= this.mapWidth) return false;
    return this.grid[row][col];
  }

  clampPosition(x: number, z: number): { x: number; z: number } {
    const r = this.radius;

    // If center is not walkable, don't clamp (let them move out)
    if (!this.isWalkable(x, z)) {
      return { x, z };
    }

    // Check +X (right)
    if (!this.isWalkable(x + r, z)) {
      // Non-walkable tile starts at col = floor(x+r)
      // Stay left of that tile: x + r < tileLeftEdge
      const tileLeft = Math.floor(x + r);
      x = tileLeft - r;
    }

    // Check -X (left)
    if (!this.isWalkable(x - r, z)) {
      // Non-walkable tile ends at col+1 = ceil(x-r)
      const tileRight = Math.ceil(x - r);
      x = tileRight + r;
    }

    // Check +Z (moving toward row 0, more positive Z)
    if (!this.isWalkable(x, z + r)) {
      // z+r entered a non-walkable row
      // hitRow = floor(-(z+r))
      // Row hitRow occupies Z in (-(hitRow+1), -hitRow]
      // To stay out, we need z+r to remain in the next row (hitRow+1):
      // floor(-(z+r)) >= hitRow+1, meaning z+r <= -(hitRow+1)
      const hitRow = Math.floor(-(z + r));
      z = -(hitRow + 1) - r;
    }

    // Check -Z (moving toward higher rows, more negative Z)
    if (!this.isWalkable(x, z - r)) {
      // z-r entered a non-walkable row
      // hitRow = floor(-(z-r))
      // To stay out, need z-r in row hitRow-1:
      // Row hitRow-1 occupies Z in (-hitRow, -(hitRow-1)]
      // So z-r > -hitRow, meaning z > -hitRow + r
      const hitRow = Math.floor(-(z - r));
      z = -hitRow + r + 0.001;
    }

    return { x, z };
  }
}
