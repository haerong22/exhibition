import * as THREE from 'three';
import { DEFAULTS } from '../utils/constants';

export class TextureManager {
  private cache = new Map<string, THREE.Texture>();
  private loader = new THREE.TextureLoader();
  private placeholderTexture: THREE.Texture | null = null;

  constructor() {
    this.loader.setCrossOrigin('anonymous');
  }

  async loadAll(
    urls: string[],
    onProgress?: (loaded: number, total: number) => void
  ): Promise<Map<string, THREE.Texture>> {
    const total = urls.length;
    let loaded = 0;

    const promises = urls.map(async (url) => {
      if (this.cache.has(url)) {
        loaded++;
        onProgress?.(loaded, total);
        return;
      }
      try {
        const texture = await this.loader.loadAsync(url);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;

        // Resize if too large
        if (texture.image && (texture.image.width > DEFAULTS.MAX_TEXTURE_SIZE || texture.image.height > DEFAULTS.MAX_TEXTURE_SIZE)) {
          this.resizeTexture(texture);
        }

        this.cache.set(url, texture);
      } catch {
        this.cache.set(url, this.getPlaceholder());
      }
      loaded++;
      onProgress?.(loaded, total);
    });

    await Promise.all(promises);
    return this.cache;
  }

  get(url: string): THREE.Texture | undefined {
    return this.cache.get(url);
  }

  private resizeTexture(texture: THREE.Texture): void {
    const img = texture.image as HTMLImageElement;
    const max = DEFAULTS.MAX_TEXTURE_SIZE;
    const scale = Math.min(max / img.width, max / img.height);
    const w = Math.floor(img.width * scale);
    const h = Math.floor(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    texture.image = canvas;
    texture.needsUpdate = true;
  }

  private getPlaceholder(): THREE.Texture {
    if (this.placeholderTexture) return this.placeholderTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#888';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('이미지를 불러올 수 없습니다', 256, 256);

    this.placeholderTexture = new THREE.CanvasTexture(canvas);
    this.placeholderTexture.colorSpace = THREE.SRGBColorSpace;
    return this.placeholderTexture;
  }

  dispose(): void {
    for (const tex of this.cache.values()) {
      tex.dispose();
    }
    this.cache.clear();
    this.placeholderTexture?.dispose();
    this.placeholderTexture = null;
  }
}
