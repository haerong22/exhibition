import * as THREE from 'three';
import { DEFAULTS } from '../utils/constants';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;
  private updateCallbacks: ((delta: number) => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);
    this.scene.fog = new THREE.Fog(0xf5f5f0, 15, 40);

    this.camera = new THREE.PerspectiveCamera(
      DEFAULTS.CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      DEFAULTS.CAMERA_NEAR,
      DEFAULTS.CAMERA_FAR
    );
    this.camera.position.set(0, DEFAULTS.EYE_HEIGHT, 0);

    this.clock = new THREE.Clock();

    window.addEventListener('resize', this.onResize);
  }

  onUpdate(callback: (delta: number) => void): void {
    this.updateCallbacks.push(callback);
  }

  start(): void {
    this.renderer.setAnimationLoop(this.tick);
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }

  private tick = (): void => {
    const delta = this.clock.getDelta();
    for (const cb of this.updateCallbacks) {
      cb(delta);
    }
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
