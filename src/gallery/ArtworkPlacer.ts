import * as THREE from 'three';
import type { ArtworkConfig, WallSegment } from '../types/exhibition';
import { DEFAULTS } from '../utils/constants';

interface PlacedArtwork {
  config: ArtworkConfig;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  wallNormal: THREE.Vector3;
}

export class ArtworkPlacer {
  place(artworks: ArtworkConfig[], walls: WallSegment[]): PlacedArtwork[] {
    const wallMap = new Map<string, ArtworkConfig[]>();
    for (const w of walls) wallMap.set(w.id, []);

    // Assign artworks to walls
    const unassigned: ArtworkConfig[] = [];
    for (const art of artworks) {
      if (art.wall && wallMap.has(art.wall)) {
        wallMap.get(art.wall)!.push(art);
      } else {
        unassigned.push(art);
      }
    }

    // Distribute unassigned evenly across walls
    const wallIds = walls.map((w) => w.id);
    let wallIdx = 0;
    for (const art of unassigned) {
      // Find wall with most remaining space
      let bestWall = wallIds[wallIdx % wallIds.length];
      wallMap.get(bestWall)!.push(art);
      wallIdx++;
    }

    // Place artworks on each wall
    const result: PlacedArtwork[] = [];

    for (const wall of walls) {
      const wallArtworks = wallMap.get(wall.id)!;
      if (wallArtworks.length === 0) continue;

      const totalArtWidth = wallArtworks.reduce((sum, a) => sum + a.width, 0);
      const gaps = wallArtworks.length + 1;
      const availableSpace = wall.width - totalArtWidth;
      const gap = Math.max(DEFAULTS.MIN_ARTWORK_GAP, availableSpace / gaps);

      let currentX = -wall.width / 2 + gap;

      for (const art of wallArtworks) {
        const x = currentX + art.width / 2;
        const y = DEFAULTS.ARTWORK_CENTER_HEIGHT;

        // Calculate world position based on wall
        const pos = new THREE.Vector3();
        const normal = new THREE.Vector3(wall.normal.x, wall.normal.y, wall.normal.z);

        switch (wall.id) {
          case 'north':
            pos.set(x, y, wall.position.z + DEFAULTS.WALL_OFFSET);
            break;
          case 'south':
            pos.set(-x, y, wall.position.z - DEFAULTS.WALL_OFFSET);
            break;
          case 'east':
            pos.set(wall.position.x - DEFAULTS.WALL_OFFSET, y, x);
            break;
          case 'west':
            pos.set(wall.position.x + DEFAULTS.WALL_OFFSET, y, -x);
            break;
        }

        const rotation = new THREE.Euler(0, wall.rotation, 0);

        result.push({
          config: art,
          position: pos,
          rotation,
          wallNormal: normal,
        });

        currentX += art.width + gap;
      }
    }

    return result;
  }
}
