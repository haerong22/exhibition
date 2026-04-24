import * as THREE from 'three';
import { easeInOutCubic } from '../utils/math';
import { DEFAULTS } from '../utils/constants';
import type { CameraState } from '../types/exhibition';

interface TransitionTarget {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  state: CameraState = 'WALKING';

  private savedPosition = new THREE.Vector3();
  private savedQuaternion = new THREE.Quaternion();
  private transitionTarget: TransitionTarget | null = null;
  private transitionProgress = 0;
  private startPosition = new THREE.Vector3();
  private startQuaternion = new THREE.Quaternion();
  private onTransitionComplete: (() => void) | null = null;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  transitionToArtwork(target: TransitionTarget, onComplete?: () => void): void {
    // Allow from WALKING (first focus) or VIEWING_ARTWORK (switching between artworks)
    if (this.state !== 'WALKING' && this.state !== 'VIEWING_ARTWORK') return;

    // Only save position when entering from WALKING — preserves return point when navigating between artworks
    if (this.state === 'WALKING') {
      this.savedPosition.copy(this.camera.position);
      this.savedQuaternion.copy(this.camera.quaternion);
    }
    this.startPosition.copy(this.camera.position);
    this.startQuaternion.copy(this.camera.quaternion);

    this.transitionTarget = target;
    this.transitionProgress = 0;
    this.state = 'TRANSITIONING_TO_ARTWORK';
    this.onTransitionComplete = onComplete ?? null;
  }

  transitionBack(onComplete?: () => void): void {
    if (this.state !== 'VIEWING_ARTWORK') return;

    this.startPosition.copy(this.camera.position);
    this.startQuaternion.copy(this.camera.quaternion);

    this.transitionTarget = {
      position: this.savedPosition.clone(),
      lookAt: new THREE.Vector3(),
    };
    this.transitionProgress = 0;
    this.state = 'TRANSITIONING_BACK';
    this.onTransitionComplete = onComplete ?? null;
  }

  update(delta: number): void {
    if (
      this.state !== 'TRANSITIONING_TO_ARTWORK' &&
      this.state !== 'TRANSITIONING_BACK'
    )
      return;

    this.transitionProgress += delta / DEFAULTS.TRANSITION_DURATION;
    const t = easeInOutCubic(Math.min(this.transitionProgress, 1));

    if (this.transitionTarget) {
      this.camera.position.lerpVectors(
        this.startPosition,
        this.transitionTarget.position,
        t
      );

      if (this.state === 'TRANSITIONING_TO_ARTWORK') {
        // Look towards artwork
        const targetQuat = new THREE.Quaternion();
        const tempCam = this.camera.clone();
        tempCam.position.copy(this.transitionTarget.position);
        tempCam.lookAt(this.transitionTarget.lookAt);
        targetQuat.copy(tempCam.quaternion);
        this.camera.quaternion.slerpQuaternions(
          this.startQuaternion,
          targetQuat,
          t
        );
      } else {
        // Restore original orientation
        this.camera.quaternion.slerpQuaternions(
          this.startQuaternion,
          this.savedQuaternion,
          t
        );
      }
    }

    if (this.transitionProgress >= 1) {
      if (this.state === 'TRANSITIONING_TO_ARTWORK') {
        this.state = 'VIEWING_ARTWORK';
      } else {
        this.state = 'WALKING';
      }
      this.onTransitionComplete?.();
      this.onTransitionComplete = null;
    }
  }
}
