import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { TileType, TileCell, GridMap } from './types/tiled';
import { TiledMapParser } from './gallery/TiledMapParser';
import { TiledGalleryBuilder, type TextureConfig } from './gallery/TiledGalleryBuilder';
import { TextureManager } from './systems/TextureManager';
import { CustomMapStore, type CustomMap } from './systems/CustomMapStore';
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
const MAP_ONLY_TILES: Set<TileType> = new Set(['floor', 'wall', 'door', 'empty']);

// ── Promise-based modal utility (replaces alert/confirm/prompt) ──
class EditorModal {
  private static modal = document.getElementById('editor-modal')!;
  private static titleEl = document.getElementById('editor-modal-title')!;
  private static body = document.getElementById('editor-modal-body')!;
  private static footer = document.getElementById('editor-modal-footer')!;
  private static closeBtn = document.getElementById('editor-modal-close')!;
  private static cleanup: (() => void) | null = null;

  private static show(onDismiss: () => void): void {
    // Wire overlay + close button to dismiss
    this.cleanup?.();
    const dismiss = () => { this.hide(); onDismiss(); };
    const overlayClick = (e: Event) => { if (e.target === this.modal.querySelector('.modal-overlay')) dismiss(); };
    const keydown = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    this.modal.addEventListener('click', overlayClick);
    window.addEventListener('keydown', keydown);
    this.closeBtn.addEventListener('click', dismiss);
    this.cleanup = () => {
      this.modal.removeEventListener('click', overlayClick);
      window.removeEventListener('keydown', keydown);
      this.closeBtn.removeEventListener('click', dismiss);
    };
    this.modal.classList.add('visible');
  }

  private static hide(): void {
    this.modal.classList.remove('visible');
    this.cleanup?.();
    this.cleanup = null;
  }

  static alert(message: string, title = '알림'): Promise<void> {
    return new Promise((resolve) => {
      this.titleEl.textContent = title;
      this.body.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = message;
      this.body.appendChild(p);
      this.footer.innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'modal-btn primary';
      btn.textContent = '확인';
      btn.addEventListener('click', () => { this.hide(); resolve(); });
      this.footer.appendChild(btn);
      this.show(() => resolve());
      btn.focus();
    });
  }

  static confirm(message: string, { title = '확인', confirmText = '확인', cancelText = '취소', danger = false } = {}): Promise<boolean> {
    return new Promise((resolve) => {
      this.titleEl.textContent = title;
      this.body.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = message;
      this.body.appendChild(p);
      this.footer.innerHTML = '';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'modal-btn';
      cancelBtn.textContent = cancelText;
      cancelBtn.addEventListener('click', () => { this.hide(); resolve(false); });
      this.footer.appendChild(cancelBtn);
      const okBtn = document.createElement('button');
      okBtn.className = danger ? 'modal-btn danger' : 'modal-btn primary';
      okBtn.textContent = confirmText;
      okBtn.addEventListener('click', () => { this.hide(); resolve(true); });
      this.footer.appendChild(okBtn);
      this.show(() => resolve(false));
      okBtn.focus();
    });
  }

  static prompt(message: string, defaultValue = '', title = '입력'): Promise<string | null> {
    return new Promise((resolve) => {
      this.titleEl.textContent = title;
      this.body.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = message;
      this.body.appendChild(p);
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'modal-input';
      input.value = defaultValue;
      this.body.appendChild(input);
      this.footer.innerHTML = '';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'modal-btn';
      cancelBtn.textContent = '취소';
      cancelBtn.addEventListener('click', () => { this.hide(); resolve(null); });
      this.footer.appendChild(cancelBtn);
      const okBtn = document.createElement('button');
      okBtn.className = 'modal-btn primary';
      okBtn.textContent = '확인';
      okBtn.addEventListener('click', () => { this.hide(); resolve(input.value); });
      this.footer.appendChild(okBtn);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { this.hide(); resolve(input.value); }
      });
      this.show(() => resolve(null));
      input.focus();
      input.select();
    });
  }

  static choose<T extends string>(title: string, options: { value: T; label: string; desc?: string }[]): Promise<T | null> {
    return new Promise((resolve) => {
      this.titleEl.textContent = title;
      this.body.innerHTML = '';
      for (const opt of options) {
        const btn = document.createElement('button');
        btn.className = 'modal-choice';
        const strong = document.createElement('strong');
        strong.textContent = opt.label;
        btn.appendChild(strong);
        if (opt.desc) {
          const span = document.createElement('span');
          span.textContent = opt.desc;
          btn.appendChild(span);
        }
        btn.addEventListener('click', () => { this.hide(); resolve(opt.value); });
        this.body.appendChild(btn);
      }
      this.footer.innerHTML = '';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'modal-btn';
      cancelBtn.textContent = '취소';
      cancelBtn.addEventListener('click', () => { this.hide(); resolve(null); });
      this.footer.appendChild(cancelBtn);
      this.show(() => resolve(null));
    });
  }
}

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
  private currentMapId: string | null = null;
  private currentMapName: string | null = null;
  private editorMode: 'map' | 'exhibition' = 'map';

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

    // Load a saved map if editor was opened with ?edit={id}
    this.handleInitialLoad();
  }

  private handleInitialLoad(): void {
    const params = new URLSearchParams(window.location.search);

    const editId = params.get('edit');
    if (editId) {
      const map = CustomMapStore.get(editId);
      if (!map) {
        EditorModal.alert('요청한 전시회를 찾을 수 없습니다.');
        return;
      }
      this.loadMapIntoEditor(map);
      this.setEditorMode('exhibition');
      return;
    }

    const templateId = params.get('template');
    if (templateId) {
      this.loadTemplate(templateId);
      this.setEditorMode('exhibition');
    }
  }

  private async loadTemplate(templateId: string): Promise<void> {
    try {
      const res = await fetch(`/templates/${encodeURIComponent(templateId)}.json`);
      if (!res.ok) throw new Error('not found');
      const gridMap: GridMap = await res.json();

      this.width = gridMap.width;
      this.height = gridMap.height;
      this.grid = gridMap.grid.map((row) => row.map((c) => ({ ...c })));

      (document.getElementById('map-width') as HTMLInputElement).value = String(this.width);
      (document.getElementById('map-height') as HTMLInputElement).value = String(this.height);
      (document.getElementById('wall-height') as HTMLInputElement).value = String(gridMap.wallHeight ?? 4);

      // Do NOT set currentMapId — saving will create a brand new exhibition
      this.currentMapId = null;
      this.currentMapName = null;
      this.updateCurrentMapLabel();

      this.resizeCanvas();
      this.render();
      this.schedulePreviewUpdate();
    } catch {
      EditorModal.alert('템플릿을 불러올 수 없습니다: ' + templateId);
    }
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

    // New map (reset state and drop current id)
    document.getElementById('btn-new')!.addEventListener('click', async () => {
      const ok = await EditorModal.confirm('현재 상태를 초기화할까요?\n저장되지 않은 변경 사항은 사라집니다.');
      if (ok) {
        this.currentMapId = null;
        this.currentMapName = null;
        this.projects = [];
        this.initGrid();
        this.updateCurrentMapLabel();
        this.render();
        this.schedulePreviewUpdate();
      }
    });

    // Export
    document.getElementById('btn-export')!.addEventListener('click', () => {
      this.exportJSON();
    });

    // Save to browser
    document.getElementById('btn-save')!.addEventListener('click', () => {
      this.saveCurrentMap();
    });

    // My maps modal
    document.getElementById('btn-my-maps')!.addEventListener('click', () => {
      this.openMapsModal();
    });
    document.getElementById('maps-modal-close')!.addEventListener('click', () => {
      this.closeMapsModal();
    });
    document.querySelector('#maps-modal .modal-overlay')!.addEventListener('click', () => {
      this.closeMapsModal();
    });

    // Mode toggle
    document.getElementById('btn-mode-toggle')!.addEventListener('click', () => {
      this.setEditorMode(this.editorMode === 'map' ? 'exhibition' : 'map');
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

    // In exhibition mode, only allow artwork + spawn placement
    if (this.editorMode === 'exhibition' && MAP_ONLY_TILES.has(this.currentTool)) return;

    const cell: TileCell = { type: this.currentTool };

    if (this.currentTool === 'artwork') {
      const artId = this.getSelectedArtworkId();
      if (!artId) {
        EditorModal.alert('작품을 선택하거나 ID를 입력해주세요');
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

  private async saveCurrentMap(): Promise<void> {
    const hasContent = this.grid.some((row) => row.some((c) => c.type !== 'empty'));
    if (!hasContent) {
      await EditorModal.alert('빈 맵은 저장할 수 없습니다.');
      return;
    }

    const choice = await EditorModal.choose('저장 유형 선택', [
      { value: 'template' as const, label: '템플릿으로 저장', desc: '맵 레이아웃만 저장합니다' },
      { value: 'exhibition' as const, label: '전시회로 저장', desc: '맵 + 작품을 함께 저장합니다' },
    ]);
    if (!choice) return;

    const isTemplate = choice === 'template';
    const typeLabel = isTemplate ? '템플릿' : '전시회';
    const defaultName = this.currentMapName ?? `내 ${typeLabel} ${new Date().toLocaleDateString('ko-KR')}`;
    const name = await EditorModal.prompt(`${typeLabel} 이름을 입력하세요`, defaultName, '이름 입력');
    if (!name || !name.trim()) return;

    const id = this.currentMapId ?? CustomMapStore.newId();
    const existing = this.currentMapId ? CustomMapStore.get(this.currentMapId) : null;

    const map: CustomMap = {
      id,
      name: name.trim(),
      type: isTemplate ? 'template' : 'exhibition',
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      gridMap: this.getGridMap(),
      textures: this.getTextureConfig(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artworks: isTemplate ? [] : (this.buildArtworksConfig() as any),
    };

    const saved = CustomMapStore.save(map);
    this.currentMapId = saved.id;
    this.currentMapName = saved.name;
    this.updateCurrentMapLabel();

    if (isTemplate) {
      await EditorModal.alert(`템플릿이 저장되었습니다: ${saved.name}`, '저장 완료');
    } else {
      const goToGallery = await EditorModal.confirm(
        `전시회가 저장되었습니다: ${saved.name}\n\n갤러리에서 보시겠습니까?`,
        { title: '저장 완료', confirmText: '갤러리로 이동', cancelText: '계속 편집' },
      );
      if (goToGallery) {
        window.location.href = `/#/exhibition/custom-${saved.id}`;
      }
    }
  }

  private loadMapIntoEditor(map: CustomMap): void {
    // Restore dimensions + grid
    this.width = map.gridMap.width;
    this.height = map.gridMap.height;
    this.grid = map.gridMap.grid.map((row) => row.map((c) => ({ ...c })));

    (document.getElementById('map-width') as HTMLInputElement).value = String(this.width);
    (document.getElementById('map-height') as HTMLInputElement).value = String(this.height);
    (document.getElementById('wall-height') as HTMLInputElement).value = String(map.gridMap.wallHeight ?? 4);

    // Restore texture selects
    this.applyTextureConfig(map.textures);

    // Restore projects from saved artworks so artwork cells resolve to their imageUrl on preview/save
    this.projects = (map.artworks ?? []).map((art) => ({
      projectId: art.id,
      title: art.title,
      imageUrl: art.imageUrl,
      owner: { nickname: art.artist },
    }));
    this.refreshArtworkSelect();

    // Track identity for subsequent saves
    this.currentMapId = map.id;
    this.currentMapName = map.name;
    this.updateCurrentMapLabel();

    this.resizeCanvas();
    this.render();
    this.schedulePreviewUpdate();
  }

  private applyTextureConfig(tex: TextureConfig): void {
    const apply = (selectId: string, urlId: string, value: string) => {
      const sel = document.getElementById(selectId) as HTMLSelectElement;
      const urlInput = document.getElementById(urlId) as HTMLInputElement;
      // If the value matches an option, use it; otherwise treat as custom URL
      const match = Array.from(sel.options).some((o) => o.value === value);
      if (match) {
        sel.value = value;
        urlInput.style.display = value === 'custom' ? 'block' : 'none';
        urlInput.value = '';
      } else if (value) {
        sel.value = 'custom';
        urlInput.style.display = 'block';
        urlInput.value = value;
      } else {
        sel.value = '';
        urlInput.style.display = 'none';
        urlInput.value = '';
      }
    };
    apply('tex-floor', 'tex-floor-url', tex.floor);
    apply('tex-wall', 'tex-wall-url', tex.wall);
    apply('tex-ceiling', 'tex-ceiling-url', tex.ceiling);
  }

  private refreshArtworkSelect(): void {
    const select = document.getElementById('artwork-select') as HTMLSelectElement;
    select.innerHTML = '<option value="">-- 작품 선택 --</option>';
    for (const p of this.projects) {
      const opt = document.createElement('option');
      opt.value = p.projectId;
      opt.textContent = `${p.title} (${p.owner.nickname})`;
      select.appendChild(opt);
    }
  }

  private setEditorMode(mode: 'map' | 'exhibition'): void {
    this.editorMode = mode;
    document.body.classList.toggle('mode-exhibition', mode === 'exhibition');

    const label = document.getElementById('mode-label')!;
    label.textContent = mode === 'map' ? '맵 편집 모드' : '전시 모드';

    const dot = document.getElementById('mode-dot')!;
    dot.className = `mode-dot ${mode}`;

    // If current tool is now hidden, auto-switch to artwork
    if (mode === 'exhibition' && MAP_ONLY_TILES.has(this.currentTool)) {
      this.currentTool = 'artwork';
      document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
      const artBtn = document.querySelector('.tool-btn[data-tool="artwork"]') as HTMLElement;
      artBtn?.classList.add('active');
      document.getElementById('artwork-options')!.classList.add('visible');
    }
  }

  private updateCurrentMapLabel(): void {
    const label = document.getElementById('current-map-label');
    if (!label) return;
    if (this.currentMapName) {
      label.innerHTML = `편집 중: <strong></strong>`;
      label.querySelector('strong')!.textContent = this.currentMapName;
    } else {
      label.textContent = '새 전시회';
    }
  }

  private openMapsModal(): void {
    const modal = document.getElementById('maps-modal')!;
    const body = document.getElementById('maps-modal-body')!;
    const maps = CustomMapStore.list();

    body.innerHTML = '';
    if (maps.length === 0) {
      body.innerHTML = '<div class="modal-empty">저장된 전시회가 없습니다.</div>';
    } else {
      for (const map of maps) {
        body.appendChild(this.renderMapItem(map));
      }
    }
    modal.classList.add('visible');
  }

  private closeMapsModal(): void {
    document.getElementById('maps-modal')!.classList.remove('visible');
  }

  private renderMapItem(map: CustomMap): HTMLElement {
    const item = document.createElement('div');
    item.className = 'map-item';

    const main = document.createElement('div');
    main.className = 'map-main';
    const size = `${map.gridMap.width}×${map.gridMap.height}`;
    const updated = new Date(map.updatedAt).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    main.innerHTML = `<h4></h4><div class="map-meta"></div>`;
    main.querySelector('h4')!.textContent = map.name;
    main.querySelector('.map-meta')!.textContent = `${size} · 작품 ${map.artworks?.length ?? 0}개 · ${updated}`;
    item.appendChild(main);

    const actions = document.createElement('div');
    actions.className = 'map-actions';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'map-btn';
    loadBtn.textContent = '불러오기';
    loadBtn.addEventListener('click', () => {
      this.loadMapIntoEditor(map);
      this.closeMapsModal();
    });
    actions.appendChild(loadBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'map-btn danger';
    deleteBtn.textContent = '삭제';
    deleteBtn.addEventListener('click', async () => {
      const ok = await EditorModal.confirm(
        `"${map.name}"을(를) 삭제할까요?`,
        { title: '삭제 확인', confirmText: '삭제', danger: true },
      );
      if (ok) {
        CustomMapStore.delete(map.id);
        if (this.currentMapId === map.id) {
          this.currentMapId = null;
          this.currentMapName = null;
          this.updateCurrentMapLabel();
        }
        this.openMapsModal();
      }
    });
    actions.appendChild(deleteBtn);

    item.appendChild(actions);
    return item;
  }
}

new MapEditor();
