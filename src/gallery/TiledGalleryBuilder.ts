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
