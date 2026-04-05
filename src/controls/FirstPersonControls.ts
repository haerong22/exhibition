import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { InputManager } from '../core/InputManager';
import { DEFAULTS } from '../utils/constants';
import { clamp } from '../utils/math';

export class FirstPersonControls {
  readonly pointerLock: PointerLockControls;
  private input: InputManager;
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private boundary: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  private _enabled = true;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, input: InputManager) {
    this.pointerLock = new PointerLockControls(camera, domElement);
    this.input = input;
  }

  set enabled(v: boolean) {
    this._enabled = v;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  get isLocked(): boolean {
    return this.pointerLock.isLocked;
  }

  lock(): void {
    this.pointerLock.lock();
  }

  unlock(): void {
    this.pointerLock.unlock();
  }

  setBoundary(b: { minX: number; maxX: number; minZ: number; maxZ: number } | null): void {
    this.boundary = b;
  }

  update(delta: number): void {
    if (!this.pointerLock.isLocked || !this._enabled) return;

    const speed = this.input.isPressed('ShiftLeft') || this.input.isPressed('ShiftRight')
      ? DEFAULTS.SPRINT_SPEED
      : DEFAULTS.MOVE_SPEED;

    this.direction.set(0, 0, 0);

    if (this.input.isPressed('KeyW') || this.input.isPressed('ArrowUp')) this.direction.z = -1;
    if (this.input.isPressed('KeyS') || this.input.isPressed('ArrowDown')) this.direction.z = 1;
    if (this.input.isPressed('KeyA') || this.input.isPressed('ArrowLeft')) this.direction.x = -1;
    if (this.input.isPressed('KeyD') || this.input.isPressed('ArrowRight')) this.direction.x = 1;

    if (this.direction.lengthSq() > 0) {
      this.direction.normalize();
    }

    // Apply damping
    this.velocity.x -= this.velocity.x * 8.0 * delta;
    this.velocity.z -= this.velocity.z * 8.0 * delta;

    this.velocity.x += this.direction.x * speed * delta;
    this.velocity.z += this.direction.z * speed * delta;

    this.pointerLock.moveRight(this.velocity.x);
    this.pointerLock.moveForward(-this.velocity.z);

    // Enforce boundary
    if (this.boundary) {
      const cam = this.pointerLock.object;
      cam.position.x = clamp(cam.position.x, this.boundary.minX, this.boundary.maxX);
      cam.position.z = clamp(cam.position.z, this.boundary.minZ, this.boundary.maxZ);
    }

    // Keep eye height fixed
    this.pointerLock.object.position.y = DEFAULTS.EYE_HEIGHT;
  }
}
