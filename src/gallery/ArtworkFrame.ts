import * as THREE from 'three';
import type { ArtworkConfig } from '../types/exhibition';
import { COLORS, DEFAULTS } from '../utils/constants';

export class ArtworkFrame {
  readonly group: THREE.Group;
  readonly config: ArtworkConfig;

  constructor(config: ArtworkConfig, texture: THREE.Texture) {
    this.config = config;
    this.group = new THREE.Group();
    this.group.userData = { type: 'artwork', config };
    this.build(config, texture);
  }

  private build(config: ArtworkConfig, texture: THREE.Texture): void {
    const { width, height } = config;
    const style = config.frameStyle ?? 'classic';

    // Canvas (artwork image)
    const canvasGeo = new THREE.PlaneGeometry(width, height);
    const canvasMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.4,
      metalness: 0.0,
    });
    const canvas = new THREE.Mesh(canvasGeo, canvasMat);
    canvas.userData = { type: 'artwork', config };
    this.group.add(canvas);

    // Frame
    if (style !== 'none') {
      const frameWidth = style === 'classic' ? 0.06 : 0.025;
      const frameDepth = style === 'classic' ? 0.04 : 0.02;
      const color = config.frameColor
        ? new THREE.Color(config.frameColor)
        : new THREE.Color(style === 'classic' ? COLORS.FRAME_CLASSIC : COLORS.FRAME_MODERN);

      const frameMat = new THREE.MeshStandardMaterial({
        color,
        roughness: style === 'classic' ? 0.35 : 0.2,
        metalness: style === 'classic' ? 0.1 : 0.3,
      });

      const hw = width / 2;
      const hh = height / 2;
      const fw = frameWidth;

      // Top
      const top = new THREE.Mesh(new THREE.BoxGeometry(width + fw * 2, fw, frameDepth), frameMat);
      top.position.set(0, hh + fw / 2, frameDepth / 2 - 0.01);
      top.castShadow = true;
      this.group.add(top);

      // Bottom
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(width + fw * 2, fw, frameDepth), frameMat);
      bottom.position.set(0, -hh - fw / 2, frameDepth / 2 - 0.01);
      bottom.castShadow = true;
      this.group.add(bottom);

      // Left
      const left = new THREE.Mesh(new THREE.BoxGeometry(fw, height, frameDepth), frameMat);
      left.position.set(-hw - fw / 2, 0, frameDepth / 2 - 0.01);
      left.castShadow = true;
      this.group.add(left);

      // Right
      const right = new THREE.Mesh(new THREE.BoxGeometry(fw, height, frameDepth), frameMat);
      right.position.set(hw + fw / 2, 0, frameDepth / 2 - 0.01);
      right.castShadow = true;
      this.group.add(right);

      // Mat/mount (off-white behind canvas, slightly larger)
      if (style === 'classic') {
        const matPadding = 0.04;
        const matGeo = new THREE.PlaneGeometry(width + matPadding * 2, height + matPadding * 2);
        const matMat = new THREE.MeshStandardMaterial({ color: 0xfaf8f2, roughness: 0.9 });
        const mat = new THREE.Mesh(matGeo, matMat);
        mat.position.z = -0.002;
        this.group.add(mat);
      }
    }

    // Spotlight
    const spot = new THREE.SpotLight(
      COLORS.SPOT_LIGHT,
      2.0,
      8,
      Math.PI / 7,
      0.5,
      1.5
    );
    spot.position.set(0, height / 2 + 1.0, 0.8);
    spot.target = canvas;
    spot.castShadow = true;
    spot.shadow.mapSize.set(DEFAULTS.SHADOW_MAP_SIZE, DEFAULTS.SHADOW_MAP_SIZE);
    spot.shadow.bias = -0.001;
    this.group.add(spot);
    this.group.add(spot.target);

    // Wall label
    this.createLabel(config, height);
  }

  private createLabel(config: ArtworkConfig, artHeight: number): void {
    const labelCanvas = document.createElement('canvas');
    const w = 512;
    const h = 100;
    labelCanvas.width = w;
    labelCanvas.height = h;
    const ctx = labelCanvas.getContext('2d')!;

    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#333';
    ctx.font = 'bold 22px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(config.title, 20, 35);

    ctx.fillStyle = '#888';
    ctx.font = '18px -apple-system, sans-serif';
    ctx.fillText(config.artist + (config.year ? `, ${config.year}` : ''), 20, 65);

    const tex = new THREE.CanvasTexture(labelCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const labelWidth = 0.6;
    const labelHeight = labelWidth * (h / w);
    const geo = new THREE.PlaneGeometry(labelWidth, labelHeight);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 });
    const label = new THREE.Mesh(geo, mat);
    label.position.set(0, -artHeight / 2 - 0.15 - labelHeight / 2, 0.01);
    this.group.add(label);
  }

  getFocusPosition(wallNormal: THREE.Vector3): { position: THREE.Vector3; lookAt: THREE.Vector3 } {
    const worldPos = new THREE.Vector3();
    this.group.getWorldPosition(worldPos);

    const focusPos = worldPos.clone().add(
      wallNormal.clone().multiplyScalar(DEFAULTS.FOCUS_DISTANCE)
    );
    focusPos.y = DEFAULTS.EYE_HEIGHT;

    return {
      position: focusPos,
      lookAt: worldPos,
    };
  }
}
