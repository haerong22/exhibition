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

  constructor(camera: THREE.PerspectiveCamera, cameraController: CameraController) {
    this.camera = camera;
    this.cameraController = cameraController;
  }

  setArtworks(frames: ArtworkFrame[]): void {
    this.artworkFrames = frames;
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

    const config = hit.object.userData.config as ArtworkConfig;
    const frame = this.artworkFrames.find((f) => f.config.id === config.id);
    if (!frame) return false;

    const wallNormal = frame.group.userData.wallNormal as THREE.Vector3;
    const focus = frame.getFocusPosition(wallNormal);

    this.cameraController.transitionToArtwork(focus, () => {
      this.onFocus?.(config);
    });

    return true;
  }

  unfocus(): void {
    if (this.cameraController.state !== 'VIEWING_ARTWORK') return;
    this.cameraController.transitionBack(() => {
      this.onUnfocus?.();
    });
  }
}
