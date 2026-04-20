import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ParsedMap } from '../types/tiled';
import type { ExhibitionConfig } from '../types/exhibition';
import { ArtworkFrame } from './ArtworkFrame';
import { TextureManager } from '../systems/TextureManager';
import { COLORS, DEFAULTS } from '../utils/constants';
import { disposeObject } from '../utils/disposer';

export interface TextureConfig {
  floor: string;
  wall: string;
  ceiling: string;
  doorFrame?: string;
}

// Built-in procedural texture presets (1024×1024 for quality)
const S = 1024; // texture resolution
const TEXTURE_PRESETS: Record<string, { color: number; generate?: (canvas: HTMLCanvasElement) => void }> = {
  'wood-light': {
    color: 0xd4b896,
    generate: (c) => {
      const ctx = c.getContext('2d')!;
      c.width = S; c.height = S;
      // Base color with subtle gradient
      const grad = ctx.createLinearGradient(0, 0, 0, S);
      grad.addColorStop(0, '#dac4a0');
      grad.addColorStop(0.5, '#d0b88e');
      grad.addColorStop(1, '#d8c098');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, S, S);
      // Wood grain — many fine lines with varying opacity and curve
      for (let i = 0; i < 200; i++) {
        const r = 140 + Math.random() * 40, g = 100 + Math.random() * 30, b = 50 + Math.random() * 30;
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.03 + Math.random() * 0.08})`;
        ctx.lineWidth = 0.5 + Math.random() * 2;
        const y = Math.random() * S;
        ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x < S; x += 40) {
          ctx.lineTo(x, y + (Math.random() - 0.5) * 8 + Math.sin(x * 0.01) * 3);
        }
        ctx.stroke();
      }
      // Knot holes (subtle)
      for (let i = 0; i < 3; i++) {
        const kx = Math.random() * S, ky = Math.random() * S;
        const kr = 8 + Math.random() * 12;
        ctx.fillStyle = `rgba(120,80,40,0.08)`;
        ctx.beginPath(); ctx.ellipse(kx, ky, kr, kr * 1.5, Math.random(), 0, Math.PI * 2); ctx.fill();
      }
      // Plank separators with shadow
      const pw = S / 8;
      for (let x = pw; x < S; x += pw) {
        ctx.strokeStyle = 'rgba(80,55,30,0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,240,210,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 2, 0); ctx.lineTo(x + 2, S); ctx.stroke();
      }
      // Pixel noise for texture feel
      const imgData = ctx.getImageData(0, 0, S, S);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 6;
        imgData.data[i] += n; imgData.data[i + 1] += n; imgData.data[i + 2] += n;
      }
      ctx.putImageData(imgData, 0, 0);
    },
  },
  'wood-dark': {
    color: 0x8b6f47,
    generate: (c) => {
      const ctx = c.getContext('2d')!;
      c.width = S; c.height = S;
      const grad = ctx.createLinearGradient(0, 0, 0, S);
      grad.addColorStop(0, '#7a6340');
      grad.addColorStop(0.5, '#8b7048');
      grad.addColorStop(1, '#7e6742');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 250; i++) {
        const r = 50 + Math.random() * 40, g = 30 + Math.random() * 25, b = 10 + Math.random() * 20;
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.04 + Math.random() * 0.1})`;
        ctx.lineWidth = 0.5 + Math.random() * 2.5;
        const y = Math.random() * S;
        ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x < S; x += 30) {
          ctx.lineTo(x, y + (Math.random() - 0.5) * 6 + Math.sin(x * 0.015) * 2);
        }
        ctx.stroke();
      }
      const pw = S / 7;
      for (let x = pw; x < S; x += pw) {
        ctx.strokeStyle = 'rgba(30,18,8,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
        ctx.strokeStyle = 'rgba(140,110,70,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 2, 0); ctx.lineTo(x + 2, S); ctx.stroke();
      }
      const imgData = ctx.getImageData(0, 0, S, S);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 8;
        imgData.data[i] += n; imgData.data[i + 1] += n; imgData.data[i + 2] += n;
      }
      ctx.putImageData(imgData, 0, 0);
    },
  },
  'marble': {
    color: 0xf0ece4,
    generate: (c) => {
      const ctx = c.getContext('2d')!;
      c.width = S; c.height = S;
      // Warm off-white base
      ctx.fillStyle = '#f0ece4';
      ctx.fillRect(0, 0, S, S);
      // Subtle base noise
      const imgData = ctx.getImageData(0, 0, S, S);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 8;
        imgData.data[i] += n; imgData.data[i + 1] += n; imgData.data[i + 2] += n;
      }
      ctx.putImageData(imgData, 0, 0);
      // Veins — multiple layers with varying thickness
      for (let layer = 0; layer < 4; layer++) {
        const alpha = 0.04 + layer * 0.03;
        for (let i = 0; i < 15; i++) {
          const gr = 150 + Math.random() * 50, gg = 140 + Math.random() * 40, gb = 130 + Math.random() * 40;
          ctx.strokeStyle = `rgba(${gr},${gg},${gb},${alpha + Math.random() * 0.06})`;
          ctx.lineWidth = 0.5 + Math.random() * (3 + layer);
          ctx.beginPath();
          let x = Math.random() * S, y = Math.random() * S;
          ctx.moveTo(x, y);
          for (let s = 0; s < 12; s++) {
            x += (Math.random() - 0.5) * 100;
            y += (Math.random() - 0.5) * 100;
            ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 50, x, y);
          }
          ctx.stroke();
        }
      }
    },
  },
  'concrete': {
    color: 0xb0b0a8,
    generate: (c) => {
      const ctx = c.getContext('2d')!;
      c.width = S; c.height = S;
      // Base with subtle variation
      const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.7);
      grad.addColorStop(0, '#b4b4ac');
      grad.addColorStop(1, '#a8a8a0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, S, S);
      // Multi-pass noise for depth
      const imgData = ctx.getImageData(0, 0, S, S);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const n1 = (Math.random() - 0.5) * 15;
        const n2 = (Math.random() - 0.5) * 8;
        imgData.data[i] += n1 + n2; imgData.data[i + 1] += n1 + n2; imgData.data[i + 2] += n1 + n2 - 2;
      }
      ctx.putImageData(imgData, 0, 0);
      // Pitting — tiny dark spots
      for (let i = 0; i < 300; i++) {
        ctx.fillStyle = `rgba(80,80,75,${0.03 + Math.random() * 0.06})`;
        const r = 1 + Math.random() * 3;
        ctx.beginPath(); ctx.arc(Math.random() * S, Math.random() * S, r, 0, Math.PI * 2); ctx.fill();
      }
      // Hairline cracks
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = `rgba(90,90,85,${0.06 + Math.random() * 0.08})`;
        ctx.lineWidth = 0.5 + Math.random();
        ctx.beginPath();
        let x = Math.random() * S, y = Math.random() * S;
        ctx.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 80; y += (Math.random() - 0.5) * 80; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    },
  },
  'plaster': {
    color: 0xf5f0e8,
    generate: (c) => {
      const ctx = c.getContext('2d')!;
      c.width = S; c.height = S;
      ctx.fillStyle = '#f5f0e8';
      ctx.fillRect(0, 0, S, S);
      // Multi-layer noise for plaster grain
      const imgData = ctx.getImageData(0, 0, S, S);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const fine = (Math.random() - 0.5) * 6;
        const coarse = (Math.random() - 0.5) * 3;
        imgData.data[i] += fine + coarse;
        imgData.data[i + 1] += fine + coarse - 1;
        imgData.data[i + 2] += fine + coarse - 2;
      }
      ctx.putImageData(imgData, 0, 0);
      // Subtle trowel marks
      for (let i = 0; i < 30; i++) {
        ctx.strokeStyle = `rgba(220,215,205,${0.05 + Math.random() * 0.08})`;
        ctx.lineWidth = 10 + Math.random() * 30;
        ctx.lineCap = 'round';
        const x1 = Math.random() * S, y1 = Math.random() * S;
        ctx.beginPath(); ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(x1 + (Math.random() - 0.5) * 200, y1 + (Math.random() - 0.5) * 40, x1 + (Math.random() - 0.5) * 300, y1 + (Math.random() - 0.5) * 60);
        ctx.stroke();
      }
    },
  },
  'brick': {
    color: 0xb5705a,
    generate: (c) => {
      const ctx = c.getContext('2d')!;
      c.width = S; c.height = S;
      // Mortar base
      ctx.fillStyle = '#c0aa92';
      ctx.fillRect(0, 0, S, S);
      const bw = 128, bh = 64, gap = 5;
      for (let row = 0; row < S / bh + 1; row++) {
        const offset = (row % 2) * (bw / 2);
        for (let col = -1; col < S / bw + 2; col++) {
          const r = 155 + Math.random() * 35, g = 80 + Math.random() * 35, b = 60 + Math.random() * 25;
          const bx = col * bw + offset + gap / 2, by = row * bh + gap / 2;
          const bWidth = bw - gap, bHeight = bh - gap;
          // Brick body
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(bx, by, bWidth, bHeight);
          // Subtle gradient on each brick
          const bg = ctx.createLinearGradient(bx, by, bx, by + bHeight);
          bg.addColorStop(0, `rgba(255,255,255,0.06)`);
          bg.addColorStop(1, `rgba(0,0,0,0.06)`);
          ctx.fillStyle = bg;
          ctx.fillRect(bx, by, bWidth, bHeight);
          // Noise on brick surface
          for (let s = 0; s < 20; s++) {
            ctx.fillStyle = `rgba(${80 + Math.random() * 60},${40 + Math.random() * 40},${30 + Math.random() * 30},0.04)`;
            ctx.fillRect(bx + Math.random() * bWidth, by + Math.random() * bHeight, 2 + Math.random() * 6, 2 + Math.random() * 4);
          }
        }
      }
    },
  },
  'white-tile': {
    color: 0xf8f8f8,
    generate: (c) => {
      const ctx = c.getContext('2d')!;
      c.width = S; c.height = S;
      ctx.fillStyle = '#f8f8f8';
      ctx.fillRect(0, 0, S, S);
      const tileSize = S / 4;
      // Each tile gets slight color variation
      for (let ty = 0; ty < 4; ty++) {
        for (let tx = 0; tx < 4; tx++) {
          const v = 245 + Math.random() * 10;
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(tx * tileSize + 2, ty * tileSize + 2, tileSize - 4, tileSize - 4);
        }
      }
      // Grout lines
      ctx.strokeStyle = '#d8d8d8';
      ctx.lineWidth = 3;
      for (let x = 0; x <= S; x += tileSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
      }
      for (let y = 0; y <= S; y += tileSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
      }
      // Fine noise
      const imgData = ctx.getImageData(0, 0, S, S);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 4;
        imgData.data[i] += n; imgData.data[i + 1] += n; imgData.data[i + 2] += n;
      }
      ctx.putImageData(imgData, 0, 0);
    },
  },
};

export class TiledGalleryBuilder {
  private textureManager: TextureManager;
  private currentGroup: THREE.Group | null = null;
  artworkFrames: ArtworkFrame[] = [];
  skipCeiling = false;
  private originalGrid: string[][] = [];
  private texConfig: TextureConfig = { floor: 'marble', wall: 'marble', ceiling: 'marble', doorFrame: 'wood-dark' };

  constructor(textureManager: TextureManager) {
    this.textureManager = textureManager;
  }

  setOriginalGrid(grid: { type: string }[][]): void {
    this.originalGrid = grid.map(row => row.map(cell => cell.type));
  }

  setTextureConfig(config: TextureConfig): void {
    this.texConfig = config;
  }



  private async createMaterial(
    presetOrUrl: string,
    fallbackColor: number,
    roughness: number,
    repeatX = 1,
    repeatY = 1,
    side: THREE.Side = THREE.FrontSide
  ): Promise<THREE.MeshStandardMaterial> {
    const mat = new THREE.MeshStandardMaterial({ color: fallbackColor, roughness, metalness: 0, side });

    if (!presetOrUrl) return mat;

    let texture: THREE.Texture | null = null;

    // Check if it's a built-in preset
    const preset = TEXTURE_PRESETS[presetOrUrl];
    if (preset) {
      const canvas = document.createElement('canvas');
      if (preset.generate) {
        preset.generate(canvas);
        texture = new THREE.CanvasTexture(canvas);
      }
      mat.color.set(preset.color);
    } else if (presetOrUrl.startsWith('http') || presetOrUrl.startsWith('/')) {
      // It's a URL
      try {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        texture = await loader.loadAsync(presetOrUrl);
      } catch {
        // Failed to load, keep fallback color
      }
    }

    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      mat.map = texture;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    }

    return mat;
  }

  async build(
    parsedMap: ParsedMap,
    config: ExhibitionConfig,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<{
    group: THREE.Group;
    walkableGrid: boolean[][];
    mapWidth: number;
    mapDepth: number;
    spawnPoint: { x: number; z: number } | null;
  }> {
    this.dispose();

    const group = new THREE.Group();
    this.currentGroup = group;
    this.artworkFrames = [];

    const h = parsedMap.wallHeight;

    // Create materials with textures
    const floorMat = await this.createMaterial(this.texConfig.floor, COLORS.FLOOR, 0.85, 2, 2);
    const wallMat = await this.createMaterial(this.texConfig.wall, COLORS.WALL, 0.85, 2, 2, THREE.DoubleSide);
    const ceilingMat = await this.createMaterial(this.texConfig.ceiling, COLORS.CEILING, 0.9);

    // Floor
    this.buildFloor(group, parsedMap, floorMat);

    // Ceiling (skipped in editor preview for top-down visibility)
    if (!this.skipCeiling) this.buildCeiling(group, parsedMap, h, ceilingMat);

    // Walls (solid boxes for each wall tile)
    this.buildWalls(group, parsedMap, h, wallMat);

    // Door frames
    const doorFrameMat = await this.createMaterial(
      this.texConfig.doorFrame ?? '', 0x8b7d6b, 0.4, 1, 1, THREE.DoubleSide
    );
    if (!this.texConfig.doorFrame) doorFrameMat.metalness = 0.1;
    this.buildDoorFrames(group, parsedMap, h, wallMat, doorFrameMat);

    // Props (bench, pillar, pedestal)
    this.buildProps(group, h);

    // Lighting
    this.buildLighting(group, parsedMap, h);

    // Load textures (skip empty URLs)
    const urls = config.artworks.map((a) => a.imageUrl).filter((u) => u);
    if (urls.length > 0) {
      await this.textureManager.loadAll(urls, onProgress);
    }

    // Place artworks
    // GPU has ~16 texture units; PointLights use some, material textures use ~3-5.
    // Each SpotLight adds 1-2 more. Limit spotlights so total stays under budget.
    for (const slot of parsedMap.artworkSlots) {
      const artConfig = config.artworks.find((a) => a.id === slot.artworkId);
      if (!artConfig) continue;

      const texture = this.textureManager.get(artConfig.imageUrl);
      if (!texture) continue;

      const frame = new ArtworkFrame(artConfig, texture);
      frame.group.position.set(slot.worldX, DEFAULTS.ARTWORK_CENTER_HEIGHT, slot.worldZ);
      frame.group.rotation.y = slot.rotation;
      frame.group.userData.wallNormal = new THREE.Vector3(slot.normalX, slot.normalY, slot.normalZ);

      group.add(frame.group);
      this.artworkFrames.push(frame);
    }

    return {
      group,
      walkableGrid: parsedMap.walkableGrid,
      mapWidth: parsedMap.widthMeters,
      mapDepth: parsedMap.depthMeters,
      spawnPoint: parsedMap.spawnPoint,
    };
  }

  private isNonEmpty(row: number, col: number, map: ParsedMap): boolean {
    // Check if this tile is anything other than empty (floor, wall, door, artwork, spawn)
    if (this.originalGrid.length > 0) {
      if (row < 0 || row >= this.originalGrid.length) return false;
      if (col < 0 || col >= this.originalGrid[0].length) return false;
      return this.originalGrid[row][col] !== 'empty';
    }
    // Fallback: use walkable grid
    if (row < 0 || row >= map.depthMeters) return false;
    if (col < 0 || col >= map.widthMeters) return false;
    return map.walkableGrid[row][col];
  }

  private buildFloor(group: THREE.Group, map: ParsedMap, mat: THREE.MeshStandardMaterial): void {
    const geos: THREE.BufferGeometry[] = [];
    for (let row = 0; row < map.depthMeters; row++) {
      for (let col = 0; col < map.widthMeters; col++) {
        if (!this.isNonEmpty(row, col, map)) continue;
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.rotateX(-Math.PI / 2);
        geo.translate(col + 0.5, 0, -(row + 0.5));
        geos.push(geo);
      }
    }
    if (geos.length === 0) return;
    const merged = mergeGeometries(geos, false);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
    for (const g of geos) g.dispose();
  }

  private buildCeiling(group: THREE.Group, map: ParsedMap, h: number, mat: THREE.MeshStandardMaterial): void {
    const geos: THREE.BufferGeometry[] = [];
    for (let row = 0; row < map.depthMeters; row++) {
      for (let col = 0; col < map.widthMeters; col++) {
        if (!this.isNonEmpty(row, col, map)) continue;
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.rotateX(Math.PI / 2);
        geo.translate(col + 0.5, h, -(row + 0.5));
        geos.push(geo);
      }
    }
    if (geos.length === 0) return;
    const merged = mergeGeometries(geos, false);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    group.add(mesh);
    for (const g of geos) g.dispose();
  }

  private buildWalls(group: THREE.Group, _map: ParsedMap, h: number, mat: THREE.MeshStandardMaterial): void {
    const geos: THREE.BufferGeometry[] = [];
    for (let row = 0; row < this.originalGrid.length; row++) {
      for (let col = 0; col < this.originalGrid[row].length; col++) {
        if (this.originalGrid[row][col] !== 'wall') continue;
        const geo = new THREE.BoxGeometry(1, h, 1);
        geo.translate(col + 0.5, h / 2, -(row + 0.5));
        geos.push(geo);
      }
    }
    if (geos.length === 0) return;
    const merged = mergeGeometries(geos, false);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
    for (const g of geos) g.dispose();
  }

  private buildDoorFrames(group: THREE.Group, map: ParsedMap, h: number, wallMat: THREE.MeshStandardMaterial, frameMat: THREE.MeshStandardMaterial): void {

    const doorHeight = Math.min(3.2, h * 0.75);
    const frameThickness = 0.06;

    // Merge adjacent doors into groups
    const merged = this.mergeDoors(map.doorways);

    for (const doorGroup of merged) {
      const { minX, maxX, minZ, maxZ, orientation } = doorGroup;
      const centerX = (minX + maxX) / 2;
      const centerZ = (minZ + maxZ) / 2;
      const spanX = maxX - minX;
      const spanZ = maxZ - minZ;
      const aboveH = doorHeight < h ? h - doorHeight - 0.01 : 0;

      if (orientation === 'horizontal') {
        // Passage along X (wall runs N-S). Jambs at Z endpoints, spanning the wall thickness (X).
        // North jamb (at maxZ)
        group.add(this.makeBox(spanX, doorHeight, frameThickness, centerX, doorHeight / 2, maxZ - frameThickness / 2, frameMat));
        // South jamb (at minZ)
        group.add(this.makeBox(spanX, doorHeight, frameThickness, centerX, doorHeight / 2, minZ + frameThickness / 2, frameMat));
        // Lintel across the top of the opening
        group.add(this.makeBox(spanX, frameThickness, spanZ, centerX, doorHeight, centerZ, frameMat));
        // Wall above door — seals the gap above the lintel using the main wall material
        if (aboveH > 0) {
          group.add(this.makeWallBox(spanX - 0.01, aboveH, spanZ - 0.01, centerX, doorHeight + aboveH / 2, centerZ, wallMat, h));
        }
      } else {
        // Passage along Z (wall runs E-W). Jambs at X endpoints, spanning the wall thickness (Z).
        // West jamb (at minX)
        group.add(this.makeBox(frameThickness, doorHeight, spanZ, minX + frameThickness / 2, doorHeight / 2, centerZ, frameMat));
        // East jamb (at maxX)
        group.add(this.makeBox(frameThickness, doorHeight, spanZ, maxX - frameThickness / 2, doorHeight / 2, centerZ, frameMat));
        // Lintel across the top of the opening
        group.add(this.makeBox(spanX, frameThickness, spanZ, centerX, doorHeight, centerZ, frameMat));
        // Wall above door — seals the gap above the lintel using the main wall material
        if (aboveH > 0) {
          group.add(this.makeWallBox(spanX - 0.01, aboveH, spanZ - 0.01, centerX, doorHeight + aboveH / 2, centerZ, wallMat, h));
        }
      }
    }
  }

  private makeBox(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    return mesh;
  }

  // Box with per-face UVs scaled to world dimensions, so a textured wall material
  // tiles at the same spatial frequency as a reference wall tile of size (1, refH, 1).
  // This keeps brick/tile scale consistent between the main wall tiles and door wall-above fills.
  private makeWallBox(w: number, boxH: number, d: number, x: number, y: number, z: number, mat: THREE.Material, refH: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, boxH, d);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z (4 vertices per face)
    // Side faces (+X/-X/+Z/-Z) should match a 1×refH×1 wall tile's scaling:
    //   u ≈ world meters horizontally, v ≈ world meters / refH
    // Top/bottom faces (+Y/-Y) use 1 unit/m (rarely visible).
    const faceScales: [number, number][] = [
      [d, boxH / refH], // +X
      [d, boxH / refH], // -X
      [w, d],           // +Y
      [w, d],           // -Y
      [w, boxH / refH], // +Z
      [w, boxH / refH], // -Z
    ];
    for (let face = 0; face < 6; face++) {
      const [sx, sy] = faceScales[face];
      for (let v = 0; v < 4; v++) {
        const i = face * 4 + v;
        uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
      }
    }
    uv.needsUpdate = true;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    return mesh;
  }

  private mergeDoors(doorways: ParsedMap['doorways']): { minX: number; maxX: number; minZ: number; maxZ: number; orientation: string }[] {
    if (doorways.length === 0) return [];

    // Group by orientation and adjacency
    const used = new Set<number>();
    const groups: { minX: number; maxX: number; minZ: number; maxZ: number; orientation: string }[] = [];

    for (let i = 0; i < doorways.length; i++) {
      if (used.has(i)) continue;
      used.add(i);

      const d = doorways[i];
      let minX = d.worldX - 0.5;
      let maxX = d.worldX + 0.5;
      let minZ = d.worldZ - 0.5;
      let maxZ = d.worldZ + 0.5;

      // Find adjacent doors with same orientation
      let found = true;
      while (found) {
        found = false;
        for (let j = 0; j < doorways.length; j++) {
          if (used.has(j)) continue;
          if (doorways[j].orientation !== d.orientation) continue;

          const dj = doorways[j];
          const djMinX = dj.worldX - 0.5;
          const djMaxX = dj.worldX + 0.5;
          const djMinZ = dj.worldZ - 0.5;
          const djMaxZ = dj.worldZ + 0.5;

          // Check if adjacent (touching)
          const touchX = Math.abs(djMinX - maxX) < 0.01 || Math.abs(djMaxX - minX) < 0.01;
          const touchZ = Math.abs(djMinZ - maxZ) < 0.01 || Math.abs(djMaxZ - minZ) < 0.01;
          const overlapX = djMinX < maxX + 0.01 && djMaxX > minX - 0.01;
          const overlapZ = djMinZ < maxZ + 0.01 && djMaxZ > minZ - 0.01;

          if ((touchX && overlapZ) || (touchZ && overlapX)) {
            used.add(j);
            minX = Math.min(minX, djMinX);
            maxX = Math.max(maxX, djMaxX);
            minZ = Math.min(minZ, djMinZ);
            maxZ = Math.max(maxZ, djMaxZ);
            found = true;
          }
        }
      }

      groups.push({ minX, maxX, minZ, maxZ, orientation: d.orientation });
    }

    return groups;
  }

  private buildProps(group: THREE.Group, h: number): void {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.6, metalness: 0.0 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xc0b8a8, roughness: 0.7, metalness: 0.0 });
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xd0ccc0, roughness: 0.5, metalness: 0.05 });

    for (let row = 0; row < this.originalGrid.length; row++) {
      for (let col = 0; col < this.originalGrid[row].length; col++) {
        const type = this.originalGrid[row][col];
        const cx = col + 0.5;
        const cz = -(row + 0.5);

        if (type === 'bench') {
          // Bench: seat (wide flat box) + 4 legs
          const seatW = 0.8, seatD = 0.35, seatH = 0.05, seatY = 0.45;
          const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW, seatH, seatD), woodMat);
          seat.position.set(cx, seatY, cz);
          seat.castShadow = true;
          group.add(seat);
          // Legs
          const legW = 0.04, legH = seatY - seatH / 2, legD = 0.04;
          const legMat = woodMat;
          const offsets = [
            [-seatW / 2 + 0.06, -seatD / 2 + 0.05],
            [seatW / 2 - 0.06, -seatD / 2 + 0.05],
            [-seatW / 2 + 0.06, seatD / 2 - 0.05],
            [seatW / 2 - 0.06, seatD / 2 - 0.05],
          ];
          for (const [ox, oz] of offsets) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legD), legMat);
            leg.position.set(cx + ox, legH / 2, cz + oz);
            group.add(leg);
          }
        } else if (type === 'pillar') {
          // Pillar: tall cylinder
          const pillarR = 0.25, pillarH = h;
          const geo = new THREE.CylinderGeometry(pillarR, pillarR, pillarH, 16);
          const mesh = new THREE.Mesh(geo, pillarMat);
          mesh.position.set(cx, pillarH / 2, cz);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
          // Base + capital (wider rings)
          const capGeo = new THREE.CylinderGeometry(pillarR * 1.4, pillarR * 1.4, 0.12, 16);
          const base = new THREE.Mesh(capGeo, pillarMat);
          base.position.set(cx, 0.06, cz);
          group.add(base);
          const cap = new THREE.Mesh(capGeo, pillarMat);
          cap.position.set(cx, pillarH - 0.06, cz);
          group.add(cap);
        } else if (type === 'pedestal') {
          // Pedestal: base box + top platform
          const baseW = 0.5, baseD = 0.5, baseH = 0.9;
          const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseH, baseD), stoneMat);
          baseMesh.position.set(cx, baseH / 2, cz);
          baseMesh.castShadow = true;
          group.add(baseMesh);
          // Top platform (slightly wider)
          const topH = 0.06;
          const top = new THREE.Mesh(new THREE.BoxGeometry(baseW + 0.08, topH, baseD + 0.08), stoneMat);
          top.position.set(cx, baseH + topH / 2, cz);
          group.add(top);
        }
      }
    }
  }

  private buildLighting(group: THREE.Group, map: ParsedMap, h: number): void {
    // Each artwork adds a SpotLight, so reduce PointLights when many artworks exist.
    // Total lights budget ~16 for smooth performance.
    const artworkCount = map.artworkSlots.length;
    const ambient = new THREE.AmbientLight(COLORS.AMBIENT_LIGHT, artworkCount > 10 ? 0.9 : 0.7);
    group.add(ambient);

    const hemi = new THREE.HemisphereLight(COLORS.HEMISPHERE_SKY, COLORS.HEMISPHERE_GROUND, artworkCount > 10 ? 0.6 : 0.5);
    group.add(hemi);

    const area = map.widthMeters * map.depthMeters;
    const maxLights = Math.max(2, 8 - Math.floor(artworkCount / 3));
    const step = Math.max(3, Math.ceil(Math.sqrt(area / maxLights)));
    const radius = Math.max(10, step * 2.5);

    let count = 0;
    for (let row = Math.floor(step / 2); row < map.depthMeters; row += step) {
      for (let col = Math.floor(step / 2); col < map.widthMeters; col += step) {
        if (!map.walkableGrid[row]?.[col]) continue;
        const light = new THREE.PointLight(COLORS.CEILING_LIGHT, 0.8, radius, 1.5);
        light.position.set(col + 0.5, h - 0.1, -(row + 0.5));
        group.add(light);
        count++;
        if (count >= maxLights) return;
      }
    }
  }

  dispose(): void {
    if (this.currentGroup) {
      disposeObject(this.currentGroup);
      this.currentGroup.parent?.remove(this.currentGroup);
      this.currentGroup = null;
    }
    this.artworkFrames = [];
    // originalGrid and texConfig are kept — they're set before build() and needed during build()
  }
}
