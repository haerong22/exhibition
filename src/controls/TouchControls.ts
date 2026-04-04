import * as THREE from 'three';
import { DEFAULTS } from '../utils/constants';
import { clamp } from '../utils/math';

export class TouchControls {
  private camera: THREE.PerspectiveCamera;
  private enabled = false;
  private moveVector = new THREE.Vector2();
  private boundary: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;

  // Joystick
  private joystickEl: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;
  private joystickCenter = { x: 0, y: 0 };
  private joystickTouchId: number | null = null;

  // Camera look
  private lookTouchId: number | null = null;
  private lastLookPos = { x: 0, y: 0 };
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

  private onTapCallback: (() => void) | null = null;
  private tapStartTime = 0;
  private tapStartPos = { x: 0, y: 0 };

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  static isMobile(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  onTap(cb: () => void): void {
    this.onTapCallback = cb;
  }

  setBoundary(b: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
    this.boundary = b;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.createJoystick();
    window.addEventListener('touchstart', this.onTouchStart, { passive: false });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('touchend', this.onTouchEnd);
  }

  disable(): void {
    this.enabled = false;
    this.joystickEl?.remove();
    this.joystickEl = null;
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('touchend', this.onTouchEnd);
  }

  private createJoystick(): void {
    this.joystickEl = document.createElement('div');
    Object.assign(this.joystickEl.style, {
      position: 'fixed', bottom: '40px', left: '40px',
      width: '120px', height: '120px', borderRadius: '50%',
      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
      zIndex: '30', touchAction: 'none',
    });

    this.joystickKnob = document.createElement('div');
    Object.assign(this.joystickKnob.style, {
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '40px', height: '40px', borderRadius: '50%',
      background: 'rgba(255,255,255,0.3)',
    });

    this.joystickEl.appendChild(this.joystickKnob);
    document.body.appendChild(this.joystickEl);
  }

  private onTouchStart = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const isLeftHalf = touch.clientX < window.innerWidth / 2;

      if (isLeftHalf && this.joystickTouchId === null) {
        this.joystickTouchId = touch.identifier;
        const rect = this.joystickEl!.getBoundingClientRect();
        this.joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        e.preventDefault();
      } else if (!isLeftHalf && this.lookTouchId === null) {
        this.lookTouchId = touch.identifier;
        this.lastLookPos = { x: touch.clientX, y: touch.clientY };
        this.tapStartTime = Date.now();
        this.tapStartPos = { x: touch.clientX, y: touch.clientY };
        e.preventDefault();
      }
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.joystickTouchId && this.joystickKnob) {
        const dx = touch.clientX - this.joystickCenter.x;
        const dy = touch.clientY - this.joystickCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 50;
        const clampedDist = Math.min(dist, maxDist);
        const angle = Math.atan2(dy, dx);

        const kx = Math.cos(angle) * clampedDist;
        const ky = Math.sin(angle) * clampedDist;
        this.joystickKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;

        this.moveVector.set(
          clampedDist / maxDist * Math.cos(angle),
          clampedDist / maxDist * Math.sin(angle)
        );
        e.preventDefault();
      }

      if (touch.identifier === this.lookTouchId) {
        const dx = touch.clientX - this.lastLookPos.x;
        const dy = touch.clientY - this.lastLookPos.y;
        this.lastLookPos = { x: touch.clientX, y: touch.clientY };

        this.euler.setFromQuaternion(this.camera.quaternion);
        this.euler.y -= dx * 0.003;
        this.euler.x -= dy * 0.003;
        this.euler.x = clamp(this.euler.x, -Math.PI / 3, Math.PI / 3);
        this.camera.quaternion.setFromEuler(this.euler);
        e.preventDefault();
      }
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.joystickTouchId) {
        this.joystickTouchId = null;
        this.moveVector.set(0, 0);
        if (this.joystickKnob) {
          this.joystickKnob.style.transform = 'translate(-50%, -50%)';
        }
      }

      if (touch.identifier === this.lookTouchId) {
        this.lookTouchId = null;
        // Detect tap (short press, small movement)
        const elapsed = Date.now() - this.tapStartTime;
        const dx = touch.clientX - this.tapStartPos.x;
        const dy = touch.clientY - this.tapStartPos.y;
        if (elapsed < 300 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
          this.onTapCallback?.();
        }
      }
    }
  };

  update(delta: number): void {
    if (!this.enabled || this.moveVector.lengthSq() < 0.01) return;

    const speed = DEFAULTS.MOVE_SPEED * delta;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    this.camera.position.add(forward.multiplyScalar(-this.moveVector.y * speed));
    this.camera.position.add(right.multiplyScalar(this.moveVector.x * speed));

    // Enforce boundary
    if (this.boundary) {
      this.camera.position.x = clamp(this.camera.position.x, this.boundary.minX, this.boundary.maxX);
      this.camera.position.z = clamp(this.camera.position.z, this.boundary.minZ, this.boundary.maxZ);
    }

    this.camera.position.y = DEFAULTS.EYE_HEIGHT;
  }
}
