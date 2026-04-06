import * as THREE from 'three';
import type { ParsedMap } from '../types/tiled';
import type { ExhibitionConfig } from '../types/exhibition';
import { ArtworkFrame } from './ArtworkFrame';
import { TextureManager } from '../systems/TextureManager';
import { COLORS, DEFAULTS } from '../utils/constants';
import { disposeObject } from '../utils/disposer';

export class TiledGalleryBuilder {
  private textureManager: TextureManager;
  private currentGroup: THREE.Group | null = null;
  artworkFrames: ArtworkFrame[] = [];
  // Store original grid for floor/ceiling coverage
  private originalGrid: string[][] = [];

  constructor(textureManager: TextureManager) {
    this.textureManager = textureManager;
  }

  setOriginalGrid(grid: { type: string }[][]): void {
    this.originalGrid = grid.map(row => row.map(cell => cell.type));
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

    // Floor (walkable tiles only)
    this.buildFloor(group, parsedMap);

    // Ceiling (covers walkable + wall tiles to avoid black gaps)
    this.buildCeiling(group, parsedMap, h);

    // Walls (DoubleSide so visible from both directions)
    this.buildWalls(group, parsedMap, h);

    // Door frames
    this.buildDoorFrames(group, parsedMap, h);

    // Lighting
    this.buildLighting(group, parsedMap, h);

    // Load textures
    const urls = config.artworks.map((a) => a.imageUrl);
    if (urls.length > 0) {
      await this.textureManager.loadAll(urls, onProgress);
    }

    // Place artworks
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

  private buildFloor(group: THREE.Group, map: ParsedMap): void {
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.FLOOR, roughness: 0.8, metalness: 0.0,
    });

    for (let row = 0; row < map.depthMeters; row++) {
      for (let col = 0; col < map.widthMeters; col++) {
        // Place floor under walkable tiles AND wall tiles
        if (!this.isNonEmpty(row, col, map)) continue;
        const geo = new THREE.PlaneGeometry(1, 1);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(col + 0.5, 0, -(row + 0.5));
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
  }

  private buildCeiling(group: THREE.Group, map: ParsedMap, h: number): void {
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.CEILING, roughness: 0.9, metalness: 0.0,
    });

    for (let row = 0; row < map.depthMeters; row++) {
      for (let col = 0; col < map.widthMeters; col++) {
        // Place ceiling over walkable tiles AND wall tiles
        if (!this.isNonEmpty(row, col, map)) continue;
        const geo = new THREE.PlaneGeometry(1, 1);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(col + 0.5, h, -(row + 0.5));
        group.add(mesh);
      }
    }
  }

  private buildWalls(group: THREE.Group, map: ParsedMap, h: number): void {
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.WALL, roughness: 0.92, metalness: 0.0,
      side: THREE.DoubleSide,
    });

    for (const seg of map.wallSegments) {
      const geo = new THREE.PlaneGeometry(seg.length, h);
      const mesh = new THREE.Mesh(geo, mat);

      const midX = (seg.startX + seg.endX) / 2;
      const midZ = (seg.startZ + seg.endZ) / 2;
      mesh.position.set(midX, h / 2, midZ);

      // Orient wall
      if (seg.normalZ !== 0) {
        // Horizontal wall (along X axis)
        mesh.rotation.y = seg.normalZ > 0 ? 0 : Math.PI;
      } else {
        // Vertical wall (along Z axis)
        mesh.rotation.y = seg.normalX > 0 ? Math.PI / 2 : -Math.PI / 2;
      }

      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  private buildDoorFrames(group: THREE.Group, map: ParsedMap, h: number): void {
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x8b7d6b, roughness: 0.4, metalness: 0.1,
    });
    const wallAboveMat = new THREE.MeshStandardMaterial({
      color: COLORS.WALL, roughness: 0.92, side: THREE.DoubleSide,
    });

    const doorHeight = h * 0.75;
    const frameThickness = 0.06;
    const wallThickness = 0.12;

    // Merge adjacent doors into groups
    const merged = this.mergeDoors(map.doorways);

    for (const doorGroup of merged) {
      const { minX, maxX, minZ, maxZ, orientation } = doorGroup;
      const centerX = (minX + maxX) / 2;
      const centerZ = (minZ + maxZ) / 2;

      if (orientation === 'vertical') {
        // Passage along Z, pillars on X sides
        const spanZ = maxZ - minZ;

        // Left pillar
        group.add(this.makeBox(frameThickness, doorHeight, spanZ, minX + frameThickness / 2, doorHeight / 2, centerZ, frameMat));
        // Right pillar
        group.add(this.makeBox(frameThickness, doorHeight, spanZ, maxX - frameThickness / 2, doorHeight / 2, centerZ, frameMat));
        // Top beam
        group.add(this.makeBox(maxX - minX, frameThickness, spanZ, centerX, doorHeight, centerZ, frameMat));
        // Wall above door — full width and depth to seal the gap (slightly inset to avoid z-fighting)
        if (doorHeight < h) {
          const aboveH = h - doorHeight - 0.01;
          group.add(this.makeBox(maxX - minX - 0.01, aboveH, spanZ - 0.01, centerX, doorHeight + aboveH / 2, centerZ, wallAboveMat));
        }
      } else {
        // Passage along X, pillars on Z sides
        const spanX = maxX - minX;

        // Front pillar (positive Z)
        group.add(this.makeBox(spanX, doorHeight, frameThickness, centerX, doorHeight / 2, maxZ - frameThickness / 2, frameMat));
        // Back pillar (negative Z)
        group.add(this.makeBox(spanX, doorHeight, frameThickness, centerX, doorHeight / 2, minZ + frameThickness / 2, frameMat));
        // Top beam
        group.add(this.makeBox(spanX, frameThickness, maxZ - minZ, centerX, doorHeight, centerZ, frameMat));
        // Wall above door — full width and depth to seal the gap (slightly inset to avoid z-fighting)
        if (doorHeight < h) {
          const aboveH = h - doorHeight - 0.01;
          group.add(this.makeBox(spanX - 0.01, aboveH, maxZ - minZ - 0.01, centerX, doorHeight + aboveH / 2, centerZ, wallAboveMat));
        }
      }
    }
  }

  private makeBox(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
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

  private buildLighting(group: THREE.Group, map: ParsedMap, h: number): void {
    const ambient = new THREE.AmbientLight(COLORS.AMBIENT_LIGHT, 0.5);
    group.add(ambient);

    const hemi = new THREE.HemisphereLight(COLORS.HEMISPHERE_SKY, COLORS.HEMISPHERE_GROUND, 0.3);
    group.add(hemi);

    // Place ceiling lights over walkable areas every ~3 tiles
    for (let row = 1; row < map.depthMeters; row += 3) {
      for (let col = 1; col < map.widthMeters; col += 3) {
        if (!map.walkableGrid[row]?.[col]) continue;
        const light = new THREE.PointLight(COLORS.CEILING_LIGHT, 0.6, 10, 1.5);
        light.position.set(col + 0.5, h - 0.1, -(row + 0.5));
        group.add(light);
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
    this.originalGrid = [];
  }
}
