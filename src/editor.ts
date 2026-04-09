import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { TileType, TileCell, GridMap } from './types/tiled';
import { TiledMapParser } from './gallery/TiledMapParser';
import { TiledGalleryBuilder, type TextureConfig } from './gallery/TiledGalleryBuilder';
import { TextureManager } from './systems/TextureManager';
import { disposeObject } from './utils/disposer';

const TILE_SIZE = 32;
const COLORS: Record<TileType, string> = {
  empty: '#151515',
  floor: '#e0d5c0',
  wall: '#555555',
  door: '#8B6914',
  artwork: '#4a9eff',
  spawn: '#4eff7e',
};

const MOODBOARD_API_BASE = '/api-proxy/proj/v1/mood-boards';

interface ProjectItem {
  projectId: string;
  title: string;
  imageUrl: string;
  owner: { nickname: string };
}

class MapEditor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 20;
  private height = 15;
  private grid: TileCell[][] = [];
  private currentTool: TileType = 'floor';
  private isDrawing = false;
  private projects: ProjectItem[] = [];

  // 3D Preview
  private previewRenderer: THREE.WebGLRenderer;
  private previewScene: THREE.Scene;
  private previewCamera: THREE.PerspectiveCamera;
  private previewControls: OrbitControls;
  private previewBuilder: TiledGalleryBuilder;
  private textureManager: TextureManager;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private currentPreviewGroup: THREE.Group | null = null;

  constructor() {
    this.canvas = document.getElementById('grid-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    // Setup 3D preview
    const previewCanvas = document.getElementById('preview-canvas') as HTMLCanvasElement;
    this.previewRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true });
    this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.previewRenderer.toneMappingExposure = 1.0;
    this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.previewRenderer.shadowMap.enabled = true;
    this.previewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.previewScene = new THREE.Scene();
    this.previewScene.background = new THREE.Color(0x111111);

    this.previewCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    this.previewCamera.position.set(10, 8, 10);

    this.previewControls = new OrbitControls(this.previewCamera, previewCanvas);
    this.previewControls.enableDamping = true;
    this.previewControls.dampingFactor = 0.1;
    this.previewControls.target.set(5, 1, -5);

    this.textureManager = new TextureManager();
    this.previewBuilder = new TiledGalleryBuilder(this.textureManager);

    this.initGrid();
    this.bindEvents();
    this.render();
    this.resizePreview();
    this.startPreviewLoop();

    window.addEventListener('resize', () => this.resizePreview());
  }

  private resizePreview(): void {
    const panel = document.querySelector('.preview-panel') as HTMLElement;
    const header = panel.querySelector('.preview-header') as HTMLElement;
    const w = panel.clientWidth;
    const h = panel.clientHeight - header.clientHeight;
    this.previewRenderer.setSize(w, h);
    this.previewCamera.aspect = w / h;
    this.previewCamera.updateProjectionMatrix();
  }

  private startPreviewLoop(): void {
    const animate = () => {
      requestAnimationFrame(animate);
      this.previewControls.update();
      this.previewRenderer.render(this.previewScene, this.previewCamera);
    };
    animate();
  }

  private schedulePreviewUpdate(): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.updatePreview(), 300);
  }

  private async updatePreview(): Promise<void> {
    const statusEl = document.getElementById('preview-status')!;
    const overlayEl = document.getElementById('preview-overlay')!;

    // Check if there are any floor tiles
    let hasFloor = false;
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell.type === 'floor' || cell.type === 'spawn' || cell.type === 'artwork' || cell.type === 'door') {
          hasFloor = true;
          break;
        }
      }
      if (hasFloor) break;
    }

    if (!hasFloor) {
      overlayEl.style.display = 'flex';
      statusEl.textContent = '대기 중';
      statusEl.style.color = '#666';
      return;
    }

    statusEl.textContent = '업데이트 중...';
    statusEl.style.color = '#ff0';
    overlayEl.style.display = 'none';

    // Clean previous
    if (this.currentPreviewGroup) {
      disposeObject(this.currentPreviewGroup);
      this.previewScene.remove(this.currentPreviewGroup);
      this.currentPreviewGroup = null;
    }

    const gridMap = this.getGridMap();
    const parser = new TiledMapParser();
    const parsedMap = parser.parse(gridMap);

    const artworks = this.buildArtworksConfig();
    const textures = this.getTextureConfig();

    this.previewBuilder.setOriginalGrid(gridMap.grid);
    this.previewBuilder.setTextureConfig(textures);

    const config = {
      id: 'preview',
      name: 'Preview',
      description: '',
      roomShape: 'rectangular' as const,
      artworks,
    };

    try {
      const result = await this.previewBuilder.build(parsedMap, config);
      this.currentPreviewGroup = result.group;
      this.previewScene.add(result.group);

      // Update camera target to center of map
      const cx = parsedMap.widthMeters / 2;
      const cz = -parsedMap.depthMeters / 2;
      this.previewControls.target.set(cx, 1.5, cz);
      this.previewCamera.position.set(cx + parsedMap.widthMeters * 0.6, parsedMap.wallHeight * 1.5, cz + parsedMap.depthMeters * 0.6);

      statusEl.textContent = '최신';
      statusEl.style.color = '#4eff7e';
    } catch (e) {
      statusEl.textContent = '오류';
      statusEl.style.color = '#ff6b6b';
      console.error('Preview error:', e);
    }
  }

  private async loadMoodboard(moodboardId: string): Promise<void> {
    const statusEl = document.getElementById('moodboard-status')!;
    const select = document.getElementById('artwork-select') as HTMLSelectElement;

    statusEl.textContent = '불러오는 중...';
    statusEl.style.color = '#888';
    select.innerHTML = '<option value="">불러오는 중...</option>';

    try {
      const res = await fetch(`${MOODBOARD_API_BASE}/${moodboardId}/projects`);
      if (!res.ok) throw new Error('not found');
      const data = await res.json();
      this.projects = data.elements ?? [];

      select.innerHTML = '<option value="">-- 작품 선택 --</option>';
      for (const p of this.projects) {
        const opt = document.createElement('option');
        opt.value = p.projectId;
        opt.textContent = `${p.title} (${p.owner.nickname})`;
        select.appendChild(opt);
      }

      statusEl.textContent = `${this.projects.length}개 작품 로드 완료`;
      statusEl.style.color = '#4eff7e';
    } catch {
      this.projects = [];
      select.innerHTML = '<option value="">로드 실패</option>';
      statusEl.textContent = '무드보드를 찾을 수 없습니다';
      statusEl.style.color = '#ff6b6b';
    }
  }

  private initGrid(): void {
    this.grid = [];
    for (let row = 0; row < this.height; row++) {
      this.grid[row] = [];
      for (let col = 0; col < this.width; col++) {
        this.grid[row][col] = { type: 'empty' };
      }
    }
    this.resizeCanvas();
  }

  private resizeCanvas(): void {
    this.canvas.width = this.width * TILE_SIZE;
    this.canvas.height = this.height * TILE_SIZE;
  }

  private bindEvents(): void {
    // Tool selection
    document.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTool = (btn as HTMLElement).dataset.tool as TileType;

        const artOptions = document.getElementById('artwork-options')!;
        artOptions.classList.toggle('visible', this.currentTool === 'artwork');
      });
    });

    // Canvas drawing
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDrawing = true;
      this.handleDraw(e);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      this.updateStatus(e);
      if (this.isDrawing) this.handleDraw(e);
    });
    window.addEventListener('mouseup', () => {
      if (this.isDrawing) {
        this.isDrawing = false;
        this.schedulePreviewUpdate();
      }
    });

    // Resize
    document.getElementById('btn-resize')!.addEventListener('click', () => {
      const w = parseInt((document.getElementById('map-width') as HTMLInputElement).value);
      const h = parseInt((document.getElementById('map-height') as HTMLInputElement).value);
      this.resize(w, h);
      this.schedulePreviewUpdate();
    });

    // Clear
    document.getElementById('btn-clear')!.addEventListener('click', () => {
      if (confirm('맵을 초기화할까요?')) {
        this.initGrid();
        this.render();
        this.schedulePreviewUpdate();
      }
    });

    // Export
    document.getElementById('btn-export')!.addEventListener('click', () => {
      this.exportJSON();
    });

    // Preview in new tab
    document.getElementById('btn-preview')!.addEventListener('click', () => {
      this.previewInNewTab();
    });

    // Texture select: show/hide custom URL input + trigger preview update
    for (const id of ['tex-floor', 'tex-wall', 'tex-ceiling']) {
      document.getElementById(id)!.addEventListener('change', (e) => {
        const urlInput = document.getElementById(id + '-url') as HTMLInputElement;
        urlInput.style.display = (e.target as HTMLSelectElement).value === 'custom' ? 'block' : 'none';
        this.schedulePreviewUpdate();
      });
    }
    for (const id of ['tex-floor-url', 'tex-wall-url', 'tex-ceiling-url']) {
      document.getElementById(id)!.addEventListener('change', () => this.schedulePreviewUpdate());
    }

    // Wall height change
    document.getElementById('wall-height')!.addEventListener('change', () => this.schedulePreviewUpdate());

    // Load moodboard
    document.getElementById('btn-load-moodboard')!.addEventListener('click', () => {
      const id = (document.getElementById('moodboard-id') as HTMLInputElement).value.trim();
      if (id) this.loadMoodboard(id);
    });
    (document.getElementById('moodboard-id') as HTMLInputElement).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const id = (e.target as HTMLInputElement).value.trim();
        if (id) this.loadMoodboard(id);
      }
    });
  }

  private getSelectedArtworkId(): string {
    const select = (document.getElementById('artwork-select') as HTMLSelectElement).value;
    const manual = (document.getElementById('artwork-id') as HTMLInputElement).value;
    return select || manual || '';
  }

  private handleDraw(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const row = Math.floor((e.clientY - rect.top) / TILE_SIZE);

    if (row < 0 || row >= this.height || col < 0 || col >= this.width) return;

    const cell: TileCell = { type: this.currentTool };

    if (this.currentTool === 'artwork') {
      const artId = this.getSelectedArtworkId();
      if (!artId) {
        alert('작품을 선택하거나 ID를 입력해주세요');
        this.isDrawing = false;
        return;
      }
      cell.artworkId = artId;
      const facing = (document.getElementById('artwork-facing') as HTMLSelectElement).value;
      if (facing !== 'auto') cell.wallFacing = facing as TileCell['wallFacing'];
    }

    // Only one spawn point
    if (this.currentTool === 'spawn') {
      for (let r = 0; r < this.height; r++) {
        for (let c = 0; c < this.width; c++) {
          if (this.grid[r][c].type === 'spawn') {
            this.grid[r][c] = { type: 'floor' };
          }
        }
      }
    }

    this.grid[row][col] = cell;
    this.render();
  }

  private updateStatus(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const row = Math.floor((e.clientY - rect.top) / TILE_SIZE);
    document.getElementById('status-pos')!.textContent = `${col}, ${row}`;

    if (row >= 0 && row < this.height && col >= 0 && col < this.width) {
      const cell = this.grid[row][col];
      let info = cell.type;
      if (cell.artworkId) {
        const proj = this.projects.find(p => p.projectId === cell.artworkId);
        info += proj ? ` (${proj.title})` : ` (${cell.artworkId})`;
      }
      document.getElementById('status-info')!.textContent = info;
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const cell = this.grid[row][col];
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;

        ctx.fillStyle = COLORS[cell.type];
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

        if (cell.type === 'artwork') {
          ctx.fillStyle = '#fff';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🖼', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
        } else if (cell.type === 'spawn') {
          ctx.fillStyle = '#000';
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('★', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
        } else if (cell.type === 'door') {
          ctx.fillStyle = '#fff';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⊞', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
        }
      }
    }
  }

  private resize(w: number, h: number): void {
    const newGrid: TileCell[][] = [];
    for (let row = 0; row < h; row++) {
      newGrid[row] = [];
      for (let col = 0; col < w; col++) {
        if (row < this.height && col < this.width) {
          newGrid[row][col] = this.grid[row][col];
        } else {
          newGrid[row][col] = { type: 'empty' };
        }
      }
    }
    this.width = w;
    this.height = h;
    this.grid = newGrid;
    this.resizeCanvas();
    this.render();
  }

  private getGridMap(): GridMap {
    return {
      width: this.width,
      height: this.height,
      wallHeight: parseFloat((document.getElementById('wall-height') as HTMLInputElement).value) || 4,
      grid: this.grid,
    };
  }

  private getTextureConfig(): TextureConfig {
    const resolve = (selectId: string, urlId: string): string => {
      const sel = (document.getElementById(selectId) as HTMLSelectElement).value;
      if (sel === 'custom') return (document.getElementById(urlId) as HTMLInputElement).value || '';
      return sel;
    };
    return {
      floor: resolve('tex-floor', 'tex-floor-url'),
      wall: resolve('tex-wall', 'tex-wall-url'),
      ceiling: resolve('tex-ceiling', 'tex-ceiling-url'),
    };
  }

  private buildArtworksConfig(): { id: string; imageUrl: string; title: string; artist: string; width: number; height: number; frameStyle: 'modern'; frameColor: string }[] {
    const usedIds = new Set<string>();
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell.type === 'artwork' && cell.artworkId) {
          usedIds.add(cell.artworkId);
        }
      }
    }

    const artworks: { id: string; imageUrl: string; title: string; artist: string; width: number; height: number; frameStyle: 'modern'; frameColor: string }[] = [];

    for (const id of usedIds) {
      const proj = this.projects.find(p => p.projectId === id);
      if (proj) {
        const imgUrl = proj.imageUrl.replace(/https:\/\/(dev-)?files\.grafolio\.ogq\.me\//, '/img-proxy/').replace('?type=THUMBNAIL', '');
        artworks.push({
          id: proj.projectId,
          imageUrl: imgUrl,
          title: proj.title,
          artist: proj.owner.nickname,
          width: 1.4,
          height: 1.0,
          frameStyle: 'modern' as const,
          frameColor: '#2a2a2a',
        });
      } else {
        artworks.push({
          id,
          imageUrl: '',
          title: id,
          artist: 'Unknown',
          width: 1.4,
          height: 1.0,
          frameStyle: 'modern' as const,
          frameColor: '#2a2a2a',
        });
      }
    }

    return artworks;
  }

  private exportJSON(): void {
    const data = this.getGridMap();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gallery-map.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private previewInNewTab(): void {
    const data = this.getGridMap();
    const artworks = this.buildArtworksConfig();
    const textures = this.getTextureConfig();

    sessionStorage.setItem('editor-map', JSON.stringify(data));
    sessionStorage.setItem('editor-artworks', JSON.stringify(artworks));
    sessionStorage.setItem('editor-textures', JSON.stringify(textures));
    window.open('/#/exhibition/editor-preview', '_blank');
  }
}

new MapEditor();
