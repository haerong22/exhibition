import * as THREE from 'three';
import type { GridMap } from '../types/tiled';
import type { ParsedArtworkSlot } from '../types/tiled';

const MINIMAP_SIZE = 160;
const TILE_COLORS: Record<string, string> = {
  empty: 'transparent',
  floor: '#3a3a3a',
  wall: '#888888',
  door: '#6a5a20',
  artwork: '#3a7aff',
  spawn: '#3aff6a',
  bench: '#6a5030',
  pillar: '#666666',
  pedestal: '#5a5548',
  model: '#a030a0',
};

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private grid: { type: string }[][] = [];
  private mapWidth = 0;
  private mapDepth = 0;
  private artworkSlots: ParsedArtworkSlot[] = [];
  private favoriteIds = new Set<string>();
  private tileSize = 1;
  private offsetX = 0;
  private offsetY = 0;
  private onTeleportCallback: ((worldX: number, worldZ: number) => boolean) | null = null;
  private teleportMarker: { x: number; y: number; t: number; ok: boolean } | null = null;

  constructor() {
    this.canvas = document.getElementById('minimap') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
  }

  // Returning true means teleport succeeded (will show green marker); false = blocked (red)
  onTeleport(cb: (worldX: number, worldZ: number) => boolean): void {
    this.onTeleportCallback = cb;
  }

  setFavorites(ids: string[] | Set<string>): void {
    this.favoriteIds = ids instanceof Set ? new Set(ids) : new Set(ids);
  }

  private handleClick(e: MouseEvent): void {
    if (!this.canvas.classList.contains('visible')) return;
    if (!this.onTeleportCallback || this.mapWidth === 0) return;
    const rect = this.canvas.getBoundingClientRect();
    // CSS px → canvas px (DPR-aware)
    const sx = ((e.clientX - rect.left) * this.canvas.width) / rect.width;
    const sy = ((e.clientY - rect.top) * this.canvas.height) / rect.height;
    // Invert fx/fy from update(). fx(worldX) = offsetX + (mapWidth - worldX) * tileSize
    const worldX = this.mapWidth - (sx - this.offsetX) / this.tileSize;
    const rowVal = (sy - this.offsetY) / this.tileSize;
    const worldZ = -rowVal;
    const ok = this.onTeleportCallback(worldX, worldZ);
    this.teleportMarker = { x: sx, y: sy, t: performance.now(), ok };
  }

  setup(gridMap: GridMap, artworkSlots: ParsedArtworkSlot[]): void {
    this.grid = gridMap.grid;
    this.mapWidth = gridMap.width;
    this.mapDepth = gridMap.height;
    this.artworkSlots = artworkSlots;
    this.favoriteIds = new Set();

    // Scale to fit
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = MINIMAP_SIZE * dpr;
    this.canvas.height = MINIMAP_SIZE * dpr;
    this.canvas.style.width = MINIMAP_SIZE + 'px';
    this.canvas.style.height = MINIMAP_SIZE + 'px';

    const padding = 8 * dpr;
    this.tileSize = Math.min(
      (MINIMAP_SIZE * dpr - padding * 2) / this.mapWidth,
      (MINIMAP_SIZE * dpr - padding * 2) / this.mapDepth,
    );
    this.offsetX = (MINIMAP_SIZE * dpr - this.mapWidth * this.tileSize) / 2;
    this.offsetY = (MINIMAP_SIZE * dpr - this.mapDepth * this.tileSize) / 2;
  }

  show(): void {
    this.canvas.classList.add('visible');
  }

  hide(): void {
    this.canvas.classList.remove('visible');
  }

  update(camera: THREE.PerspectiveCamera): void {
    if (!this.canvas.classList.contains('visible')) return;
    if (this.mapWidth === 0) return;

    const ctx = this.ctx;
    const ts = this.tileSize;
    const ox = this.offsetX;
    const oy = this.offsetY;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Helper: flip X so 3D left = minimap left (compensates for THREE.js right-hand coords)
    const fx = (worldX: number) => ox + (this.mapWidth - worldX) * ts;
    const fy = (rowVal: number) => oy + rowVal * ts;

    // Draw tiles
    for (let row = 0; row < this.mapDepth; row++) {
      for (let col = 0; col < this.mapWidth; col++) {
        const cell = this.grid[row]?.[col];
        if (!cell || cell.type === 'empty') continue;
        const color = TILE_COLORS[cell.type] ?? TILE_COLORS.floor;
        ctx.fillStyle = color;
        ctx.fillRect(fx(col + 1), fy(row), ts, ts);
      }
    }

    // Draw artwork positions — favorites in gold, others in blue
    const dotR = Math.max(2, ts * 0.4);
    for (const slot of this.artworkSlots) {
      const ax = fx(slot.worldX);
      const ay = fy(-slot.worldZ); // worldZ = -(row+0.5)
      const isFav = this.favoriteIds.has(slot.artworkId);
      ctx.fillStyle = isFav ? '#ffd166' : '#4a9eff';
      ctx.beginPath();
      ctx.arc(ax, ay, isFav ? dotR * 1.2 : dotR, 0, Math.PI * 2);
      ctx.fill();
      if (isFav) {
        // Thin dark outline so the gold dot stays readable on light walls
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Draw player position + direction
    const camX = camera.position.x;
    const camZ = -camera.position.z; // convert worldZ back to row-space
    const px = fx(camX);
    const py = fy(camZ);

    // Direction from camera quaternion
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(camera.quaternion);
    // X is flipped in drawing, so negate dir.x. No CSS transform → rotation is natural.
    const angle = Math.atan2(-dir.x, dir.z);

    // Draw triangle (tip points UP when angle=0)
    const size = Math.max(4, ts * 0.7);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(-size * 0.6, size * 0.5);
    ctx.lineTo(size * 0.6, size * 0.5);
    ctx.closePath();
    ctx.fill();
    // White border for visibility
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Teleport feedback marker (fades over 500ms)
    if (this.teleportMarker) {
      const age = performance.now() - this.teleportMarker.t;
      const duration = 500;
      if (age >= duration) {
        this.teleportMarker = null;
      } else {
        const progress = age / duration;
        const alpha = 1 - progress;
        const ringR = Math.max(6, ts * 0.7) * (1 + progress * 1.2);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = this.teleportMarker.ok ? '#4eff7e' : '#ff4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.teleportMarker.x, this.teleportMarker.y, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}
