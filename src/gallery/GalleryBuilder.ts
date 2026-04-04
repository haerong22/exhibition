import * as THREE from 'three';
import type { ExhibitionConfig } from '../types/exhibition';
import { Room } from './Room';
import { Lighting } from './Lighting';
import { ArtworkPlacer } from './ArtworkPlacer';
import { ArtworkFrame } from './ArtworkFrame';
import { TextureManager } from '../systems/TextureManager';
import { DEFAULTS } from '../utils/constants';
import { disposeObject } from '../utils/disposer';

export class GalleryBuilder {
  private textureManager: TextureManager;
  private currentGroup: THREE.Group | null = null;
  artworkFrames: ArtworkFrame[] = [];

  constructor(textureManager: TextureManager) {
    this.textureManager = textureManager;
  }

  async build(
    config: ExhibitionConfig,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<{ group: THREE.Group; boundary: ReturnType<Room['getBoundary']> }> {
    // Dispose previous
    this.dispose();

    const group = new THREE.Group();
    this.currentGroup = group;
    this.artworkFrames = [];

    // Calculate room size if not specified
    const totalArtWidth = config.artworks.reduce((sum, a) => sum + a.width, 0);
    const roomWidth = config.roomWidth ?? Math.max(DEFAULTS.ROOM_WIDTH, totalArtWidth * 0.6 + 8);
    const roomDepth = config.roomDepth ?? Math.max(DEFAULTS.ROOM_DEPTH, totalArtWidth * 0.4 + 6);
    const wallHeight = config.wallHeight ?? DEFAULTS.WALL_HEIGHT;

    // Build room
    const room = new Room(roomWidth, roomDepth, wallHeight);
    group.add(room.group);

    // Lighting
    const lighting = new Lighting(roomWidth, roomDepth, wallHeight);
    group.add(lighting.group);

    // Load textures
    const urls = config.artworks.map((a) => a.imageUrl);
    await this.textureManager.loadAll(urls, onProgress);

    // Place artworks
    const placer = new ArtworkPlacer();
    const placements = placer.place(config.artworks, room.walls);

    for (const placement of placements) {
      const texture = this.textureManager.get(placement.config.imageUrl);
      if (!texture) continue;

      const frame = new ArtworkFrame(placement.config, texture);
      frame.group.position.copy(placement.position);
      frame.group.rotation.copy(placement.rotation);

      // Store wall normal for focus calculation
      frame.group.userData.wallNormal = placement.wallNormal;

      group.add(frame.group);
      this.artworkFrames.push(frame);
    }

    return { group, boundary: room.getBoundary() };
  }

  dispose(): void {
    if (this.currentGroup) {
      disposeObject(this.currentGroup);
      this.currentGroup.parent?.remove(this.currentGroup);
      this.currentGroup = null;
    }
    this.artworkFrames = [];
  }
}
