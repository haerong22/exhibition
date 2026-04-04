import * as THREE from 'three';
import { DEFAULTS, COLORS } from '../utils/constants';
import type { WallSegment } from '../types/exhibition';

export class Room {
  readonly group: THREE.Group;
  readonly walls: WallSegment[] = [];
  readonly wallMeshes: THREE.Mesh[] = [];
  private roomWidth: number;
  private roomDepth: number;
  private wallHeight: number;

  constructor(width?: number, depth?: number, height?: number) {
    this.roomWidth = width ?? DEFAULTS.ROOM_WIDTH;
    this.roomDepth = depth ?? DEFAULTS.ROOM_DEPTH;
    this.wallHeight = height ?? DEFAULTS.WALL_HEIGHT;
    this.group = new THREE.Group();
    this.build();
  }

  private build(): void {
    this.createFloor();
    this.createCeiling();
    this.createWalls();
    this.createBaseboards();
  }

  private createFloor(): void {
    const geo = new THREE.PlaneGeometry(this.roomWidth, this.roomDepth);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.FLOOR,
      roughness: 0.8,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  private createCeiling(): void {
    const geo = new THREE.PlaneGeometry(this.roomWidth, this.roomDepth);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.CEILING,
      roughness: 0.9,
      metalness: 0.0,
    });
    const ceiling = new THREE.Mesh(geo, mat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = this.wallHeight;
    this.group.add(ceiling);
  }

  private createWalls(): void {
    const hw = this.roomWidth / 2;
    const hd = this.roomDepth / 2;
    const h = this.wallHeight;

    const wallDefs: { id: WallSegment['id']; w: number; pos: [number, number, number]; rotY: number; normal: [number, number, number] }[] = [
      { id: 'north', w: this.roomWidth, pos: [0, h / 2, -hd], rotY: 0, normal: [0, 0, 1] },
      { id: 'south', w: this.roomWidth, pos: [0, h / 2, hd], rotY: Math.PI, normal: [0, 0, -1] },
      { id: 'east', w: this.roomDepth, pos: [hw, h / 2, 0], rotY: -Math.PI / 2, normal: [-1, 0, 0] },
      { id: 'west', w: this.roomDepth, pos: [-hw, h / 2, 0], rotY: Math.PI / 2, normal: [1, 0, 0] },
    ];

    const wallMat = new THREE.MeshStandardMaterial({
      color: COLORS.WALL,
      roughness: 0.92,
      metalness: 0.0,
      side: THREE.FrontSide,
    });

    for (const def of wallDefs) {
      const geo = new THREE.PlaneGeometry(def.w, h);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(...def.pos);
      mesh.rotation.y = def.rotY;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.wallMeshes.push(mesh);

      this.walls.push({
        id: def.id,
        width: def.w,
        height: h,
        position: { x: def.pos[0], y: def.pos[1], z: def.pos[2] },
        normal: { x: def.normal[0], y: def.normal[1], z: def.normal[2] },
        rotation: def.rotY,
      });
    }
  }

  private createBaseboards(): void {
    const hw = this.roomWidth / 2;
    const hd = this.roomDepth / 2;
    const bbH = 0.12;
    const bbD = 0.02;

    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.BASEBOARD,
      roughness: 0.5,
      metalness: 0.0,
    });

    const defs: { w: number; pos: [number, number, number]; rotY: number }[] = [
      { w: this.roomWidth, pos: [0, bbH / 2, -hd + bbD / 2], rotY: 0 },
      { w: this.roomWidth, pos: [0, bbH / 2, hd - bbD / 2], rotY: 0 },
      { w: this.roomDepth, pos: [hw - bbD / 2, bbH / 2, 0], rotY: Math.PI / 2 },
      { w: this.roomDepth, pos: [-hw + bbD / 2, bbH / 2, 0], rotY: Math.PI / 2 },
    ];

    for (const def of defs) {
      const geo = new THREE.BoxGeometry(def.w, bbH, bbD);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...def.pos);
      mesh.rotation.y = def.rotY;
      this.group.add(mesh);
    }
  }

  getBoundary(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const margin = DEFAULTS.COLLISION_DISTANCE;
    return {
      minX: -this.roomWidth / 2 + margin,
      maxX: this.roomWidth / 2 - margin,
      minZ: -this.roomDepth / 2 + margin,
      maxZ: this.roomDepth / 2 - margin,
    };
  }
}
