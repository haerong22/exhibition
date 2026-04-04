import * as THREE from 'three';
import { COLORS } from '../utils/constants';

export class Lighting {
  readonly group: THREE.Group;

  constructor(roomWidth: number, roomDepth: number, wallHeight: number) {
    this.group = new THREE.Group();
    this.setup(roomWidth, roomDepth, wallHeight);
  }

  private setup(roomWidth: number, roomDepth: number, wallHeight: number): void {
    // Ambient fill
    const ambient = new THREE.AmbientLight(COLORS.AMBIENT_LIGHT, 0.4);
    this.group.add(ambient);

    // Hemisphere for warmth
    const hemi = new THREE.HemisphereLight(
      COLORS.HEMISPHERE_SKY,
      COLORS.HEMISPHERE_GROUND,
      0.3
    );
    this.group.add(hemi);

    // Ceiling point lights in a grid
    const spacingX = 4;
    const spacingZ = 4;
    const countX = Math.max(1, Math.floor(roomWidth / spacingX));
    const countZ = Math.max(1, Math.floor(roomDepth / spacingZ));

    for (let ix = 0; ix < countX; ix++) {
      for (let iz = 0; iz < countZ; iz++) {
        const x = -roomWidth / 2 + spacingX / 2 + ix * (roomWidth / countX);
        const z = -roomDepth / 2 + spacingZ / 2 + iz * (roomDepth / countZ);

        const light = new THREE.PointLight(COLORS.CEILING_LIGHT, 0.6, 12, 1.5);
        light.position.set(x, wallHeight - 0.1, z);
        light.castShadow = false;
        this.group.add(light);
      }
    }
  }
}
