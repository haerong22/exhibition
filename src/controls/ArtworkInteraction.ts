import * as THREE from 'three';
import type { ArtworkConfig } from '../types/exhibition';
import { ArtworkFrame } from '../gallery/ArtworkFrame';
import { CameraController } from '../core/Camera';

export class ArtworkInteraction {
  private camera: THREE.PerspectiveCamera;
  private cameraController: CameraController;
  private raycaster = new THREE.Raycaster();
  private artworkFrames: ArtworkFrame[] = [];
  private onFocus: ((config: ArtworkConfig) => void) | null = null;
  private onUnfocus: (() => void) | null = null;
  private currentFrameIndex = -1;

  constructor(camera: THREE.PerspectiveCamera, cameraController: CameraController) {
    this.camera = camera;
    this.cameraController = cameraController;
  }

  setArtworks(frames: ArtworkFrame[]): void {
    // Tour order matches viewer's "next = right visually" perspective.
    // Due to THREE.js right-handed coords, this works out as counterclockwise (top-down):
    // north → west → south → east.
    const wallPriority = { north: 0, west: 1, south: 2, east: 3 } as const;
    this.artworkFrames = [...frames].sort((a, b) => {
      const aWall = this.wallOf(a);
      const bWall = this.wallOf(b);
      if (aWall !== bWall) return wallPriority[aWall] - wallPriority[bWall];
      // Within same wall, sort so "next" moves visually right for the viewer:
      // north wall: x desc (viewer faces +Z, right = -X)
      // west wall:  z desc (viewer faces -X, right = -Z = more south)
      // south wall: x asc  (viewer faces -Z, right = +X)
      // east wall:  z asc  (viewer faces +X, right = +Z = more north)
      const ax = a.group.position.x, az = a.group.position.z;
      const bx = b.group.position.x, bz = b.group.position.z;
      switch (aWall) {
        case 'north': return bx - ax;
        case 'west':  return bz - az;
        case 'south': return ax - bx;
        case 'east':  return az - bz;
      }
    });
    this.currentFrameIndex = -1;
  }

  // wallNormal points AWAY from the wall (into the room).
  // So normal direction → opposite wall.
  private wallOf(frame: ArtworkFrame): 'north' | 'south' | 'east' | 'west' {
    const n = (frame.group.userData.wallNormal as THREE.Vector3) ?? new THREE.Vector3();
    if (Math.abs(n.z) > Math.abs(n.x)) {
      // Facing +Z (north) → on south wall; facing -Z (south) → on north wall
      return n.z > 0 ? 'south' : 'north';
    }
    // Facing +X (east) → on west wall; facing -X (west) → on east wall
    return n.x > 0 ? 'west' : 'east';
  }

  onArtworkFocus(cb: (config: ArtworkConfig) => void): void {
    this.onFocus = cb;
  }

  onArtworkUnfocus(cb: () => void): void {
    this.onUnfocus = cb;
  }

  tryInteract(): boolean {
    if (this.cameraController.state === 'VIEWING_ARTWORK') {
      this.unfocus();
      return true;
    }

    if (this.cameraController.state !== 'WALKING') return false;

    // Cast ray from center of screen
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    const meshes: THREE.Object3D[] = [];
    for (const frame of this.artworkFrames) {
      frame.group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData.type === 'artwork') {
          meshes.push(child);
        }
      });
    }

    const intersects = this.raycaster.intersectObjects(meshes, false);
    if (intersects.length === 0) return false;

    const hit = intersects[0];
    if (hit.distance > 6) return false;

    // Find the frame whose group contains the hit mesh (not by id — duplicates share the same id)
    const frame = this.artworkFrames.find((f) => {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj === f.group) return true;
        obj = obj.parent;
      }
      return false;
    });
    if (!frame) return false;

    this.currentFrameIndex = this.artworkFrames.indexOf(frame);
    this.focusFrame(frame);
    return true;
  }

  // Move to next/prev artwork while viewing
  next(): void {
    this.navigate(1);
  }

  prev(): void {
    this.navigate(-1);
  }

  hasMultiple(): boolean {
    return this.artworkFrames.length > 1;
  }

  private navigate(direction: 1 | -1): void {
    if (this.artworkFrames.length === 0) return;
    if (this.cameraController.state !== 'VIEWING_ARTWORK' && this.cameraController.state !== 'TRANSITIONING_TO_ARTWORK') return;
    const len = this.artworkFrames.length;
    this.currentFrameIndex = (this.currentFrameIndex + direction + len) % len;
    const frame = this.artworkFrames[this.currentFrameIndex];
    this.focusFrame(frame);
  }

  private focusFrame(frame: ArtworkFrame): void {
    const wallNormal = frame.group.userData.wallNormal as THREE.Vector3;
    const focus = frame.getFocusPosition(wallNormal);
    this.cameraController.transitionToArtwork(focus, () => {
      this.onFocus?.(frame.config);
    });
  }

  unfocus(): void {
    if (this.cameraController.state !== 'VIEWING_ARTWORK') return;
    this.cameraController.transitionBack(() => {
      this.onUnfocus?.();
    });
  }
}
