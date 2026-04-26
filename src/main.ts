import * as THREE from 'three';
import { Engine } from './core/Engine';
import { CameraController } from './core/Camera';
import { InputManager } from './core/InputManager';
import { FirstPersonControls } from './controls/FirstPersonControls';
import { TouchControls } from './controls/TouchControls';
import { ArtworkInteraction } from './controls/ArtworkInteraction';
import { AutoTour } from './controls/AutoTour';
import QRCode from 'qrcode';
import { GalleryBuilder } from './gallery/GalleryBuilder';
import { TiledGalleryBuilder } from './gallery/TiledGalleryBuilder';
import { TiledMapParser } from './gallery/TiledMapParser';
import { TiledCollision } from './systems/TiledCollision';
import { TextureManager } from './systems/TextureManager';
import type { GridMap } from './types/tiled';
import { ExhibitionLoader } from './systems/ExhibitionLoader';
import { CustomMapStore, type CustomMap } from './systems/CustomMapStore';
import { Router, type Route } from './systems/Router';
import { LoadingScreen } from './ui/LoadingScreen';
import { ArtworkInfoPanel } from './ui/ArtworkInfoPanel';
import { HUD } from './ui/HUD';
import { Minimap } from './ui/Minimap';
import { DEFAULTS } from './utils/constants';

class App {
  private engine: Engine;
  private cameraController: CameraController;
  private input: InputManager;
  private fpControls: FirstPersonControls;
  private touchControls: TouchControls;
  private isMobile: boolean;
  private artworkInteraction: ArtworkInteraction;
  private galleryBuilder: GalleryBuilder;
  private tiledBuilder: TiledGalleryBuilder;
  private textureManager: TextureManager;
  private tiledCollision: TiledCollision | null = null;
  private builtInTemplates: { id: string; name: string; description: string; size?: string; recommended?: string }[] = [];
  private allTemplates: { id: string; name: string; description: string; size?: string; recommended?: string; customMapId?: string }[] = [];
  private templatePage = 0;
  private templateTab: 'builtin' | 'custom' = 'builtin';
  private static readonly TEMPLATES_PER_PAGE = 6;
  private loader: ExhibitionLoader;
  private router: Router;
  private loadingScreen: LoadingScreen;
  private infoPanel: ArtworkInfoPanel;
  private hud: HUD;
  private minimap: Minimap;
  private autoTour: AutoTour;

  constructor() {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;

    this.isMobile = TouchControls.isMobile();
    this.engine = new Engine(canvas);
    this.cameraController = new CameraController(this.engine.camera);
    this.input = new InputManager();
    this.fpControls = new FirstPersonControls(this.engine.camera, canvas, this.input);
    this.touchControls = new TouchControls(this.engine.camera);
    this.textureManager = new TextureManager();
    this.galleryBuilder = new GalleryBuilder(this.textureManager);
    this.tiledBuilder = new TiledGalleryBuilder(this.textureManager);
    this.loader = new ExhibitionLoader();
    this.router = new Router();
    this.loadingScreen = new LoadingScreen();
    this.infoPanel = new ArtworkInfoPanel();
    this.hud = new HUD(this.isMobile);
    this.minimap = new Minimap();
    this.artworkInteraction = new ArtworkInteraction(this.engine.camera, this.cameraController);
    this.autoTour = new AutoTour(this.artworkInteraction);

    // Reduce quality on mobile
    if (this.isMobile) {
      this.engine.renderer.setPixelRatio(1);
      this.engine.renderer.shadowMap.enabled = false;
    }

    this.setup();
  }

  private setup(): void {
    // Update loop
    this.engine.onUpdate((delta) => {
      this.cameraController.update(delta);
      if (this.cameraController.state === 'WALKING') {
        if (this.isMobile) {
          this.touchControls.update(delta);
        } else {
          this.fpControls.update(delta);
        }
        // Tile-based collision
        if (this.tiledCollision) {
          const cam = this.engine.camera;
          const clamped = this.tiledCollision.clampPosition(cam.position.x, cam.position.z);
          cam.position.x = clamped.x;
          cam.position.z = clamped.z;
        }
      }
      this.minimap.update(this.engine.camera);
    });

    // Desktop: click interaction
    this.input.onClick(() => {
      if (this.isMobile) return;

      // Don't steal pointer lock while the picker/loading UI is visible
      if (this.isUiBlockingGallery()) return;

      // Re-lock pointer if unlocked while walking
      if (!this.fpControls.isLocked && this.cameraController.state === 'WALKING') {
        this.fpControls.lock();
        return;
      }

      if (!this.fpControls.isLocked) return;

      const handled = this.artworkInteraction.tryInteract();
      if (handled && this.cameraController.state === 'TRANSITIONING_TO_ARTWORK') {
        this.fpControls.enabled = false;
        this.hud.hide();
      }
    });

    // Mobile: tap interaction
    this.touchControls.onTap(() => {
      if (this.cameraController.state === 'VIEWING_ARTWORK') {
        this.infoPanel.hide();
        this.artworkInteraction.unfocus();
        return;
      }
      const handled = this.artworkInteraction.tryInteract();
      if (handled && this.cameraController.state === 'TRANSITIONING_TO_ARTWORK') {
        this.hud.hide();
      }
    });

    // Artwork focus/unfocus
    this.artworkInteraction.onArtworkFocus((config) => {
      this.infoPanel.show(config);
      this.infoPanel.setNavVisible(this.artworkInteraction.hasMultiple());
      this.minimap.hide();
      if (!this.isMobile) this.fpControls.unlock();
    });

    this.artworkInteraction.onArtworkUnfocus(() => {
      this.infoPanel.hide();
      this.minimap.show();
    });

    // Info panel close
    this.infoPanel.onClose(() => {
      if (this.autoTour.running) this.autoTour.stop();
      this.artworkInteraction.unfocus();
      if (!this.isMobile) {
        setTimeout(() => {
          this.fpControls.lock();
          this.fpControls.enabled = true;
          this.hud.show();
        }, 100);
      } else {
        this.hud.show();
      }
    });

    // Navigate between artworks
    this.infoPanel.onPrev(() => this.artworkInteraction.prev());
    this.infoPanel.onNext(() => this.artworkInteraction.next());

    // Auto tour: stops if user closes info panel during tour
    this.autoTour.onStart(() => {
      if (!this.isMobile) this.fpControls.unlock();
    });
    this.autoTour.onStop(() => {
      // After tour ends, return to walking
      if (this.cameraController.state === 'VIEWING_ARTWORK') {
        this.artworkInteraction.unfocus();
      }
    });

    // Pointer lock events (desktop only)
    if (!this.isMobile) {
      this.fpControls.pointerLock.addEventListener('lock', () => {
        this.hud.show();
      });

      this.fpControls.pointerLock.addEventListener('unlock', () => {
        if (this.cameraController.state === 'WALKING') {
          this.hud.hide();
        }
      });
    }

    // Escape handling for artwork viewing
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.cameraController.state === 'VIEWING_ARTWORK') {
        this.infoPanel.hide();
        this.artworkInteraction.unfocus();
        if (!this.isMobile) {
          setTimeout(() => {
            this.fpControls.lock();
            this.fpControls.enabled = true;
            this.hud.show();
          }, 100);
        } else {
          this.hud.show();
        }
      }
    });

    // Router
    this.router.onRouteChange((route) => {
      this.handleRoute(route);
    });

    // Start
    this.engine.start();
    this.handleRoute(this.router.currentRoute());
  }

  private async handleRoute(route: Route): Promise<void> {
    const picker = document.getElementById('exhibition-picker');
    if (route.type === 'exhibition') {
      picker?.classList.add('hidden');
      const id = route.exhibitionId ?? 'default';
      if (id === 'editor-preview') {
        await this.loadEditorPreview();
      } else if (id.startsWith('custom-')) {
        await this.loadCustomMap(id.replace(/^custom-/, ''));
      } else {
        await this.loadExhibition(id, route.configUrl);
      }
    } else {
      // home → show picker
      await this.showPicker();
    }
  }

  private async showPicker(): Promise<void> {
    // Tear down any active scene and UIs so the picker can take over
    this.loadingScreen.hide();
    this.hud.hide();
    this.infoPanel.hide();
    this.minimap.hide();
    this.autoTour.disable();
    this.autoTour.stop();
    if (!this.isMobile) this.fpControls.unlock();
    this.engine.scene.clear();
    this.engine.scene.fog = null;
    this.tiledCollision = null;

    const picker = document.getElementById('exhibition-picker');
    picker?.classList.remove('hidden');

    const templatesEl = document.getElementById('picker-templates')!;
    const customEl = document.getElementById('picker-custom')!;

    // Fetch built-in templates once
    templatesEl.innerHTML = '<div class="picker-empty">불러오는 중...</div>';
    try {
      const res = await fetch('/templates/index.json');
      this.builtInTemplates = await res.json();
    } catch {
      this.builtInTemplates = [];
    }

    // Wire tab buttons
    const tabBuiltin = document.getElementById('tab-builtin')!;
    const tabCustom = document.getElementById('tab-custom')!;
    const countEl = document.getElementById('tab-custom-count')!;

    // Clone to remove old listeners
    const newTabBuiltin = tabBuiltin.cloneNode(true) as HTMLElement;
    const newTabCustom = tabCustom.cloneNode(true) as HTMLElement;
    tabBuiltin.replaceWith(newTabBuiltin);
    tabCustom.replaceWith(newTabCustom);

    newTabBuiltin.addEventListener('click', () => {
      this.templateTab = 'builtin';
      this.templatePage = 0;
      this.renderActiveTab(templatesEl, newTabBuiltin, newTabCustom);
    });
    newTabCustom.addEventListener('click', () => {
      this.templateTab = 'custom';
      this.templatePage = 0;
      this.renderActiveTab(templatesEl, newTabBuiltin, newTabCustom);
    });

    // Update custom count
    const customCount = CustomMapStore.listByType('template').length;
    countEl.textContent = `(${customCount})`;

    // Render active tab
    this.renderActiveTab(templatesEl, newTabBuiltin, newTabCustom);

    // Exhibitions (from localStorage)
    this.refreshCustomList(customEl);
  }

  private refreshCustomList(containerEl: HTMLElement): void {
    const maps = CustomMapStore.listByType('exhibition');
    containerEl.innerHTML = '';
    if (maps.length === 0) {
      containerEl.innerHTML = '<div class="picker-empty">저장된 전시회가 없습니다. 템플릿을 선택하여 전시회를 만들어보세요.</div>';
      return;
    }
    for (const map of maps) {
      containerEl.appendChild(this.renderCustomCard(map, containerEl));
    }
  }

  private renderActiveTab(container: HTMLElement, tabBuiltin: HTMLElement, tabCustom: HTMLElement): void {
    // Update tab active state
    tabBuiltin.classList.toggle('active', this.templateTab === 'builtin');
    tabCustom.classList.toggle('active', this.templateTab === 'custom');

    // Update custom count
    const customCount = CustomMapStore.listByType('template').length;
    const countEl = tabCustom.querySelector('.tab-count') ?? document.getElementById('tab-custom-count');
    if (countEl) countEl.textContent = `(${customCount})`;

    if (this.templateTab === 'builtin') {
      this.allTemplates = this.builtInTemplates.map((t) => ({ ...t, customMapId: undefined as string | undefined }));
    } else {
      const customTemplates = CustomMapStore.listByType('template');
      this.allTemplates = customTemplates.map((m) => ({
        id: m.id,
        name: m.name,
        description: '커스텀 템플릿',
        size: `${m.gridMap.width}×${m.gridMap.height}`,
        recommended: undefined as string | undefined,
        customMapId: m.id,
      }));
    }

    if (this.allTemplates.length === 0) {
      container.innerHTML = this.templateTab === 'builtin'
        ? '<div class="picker-empty">템플릿이 없습니다</div>'
        : '<div class="picker-empty">저장된 템플릿이 없습니다. 에디터에서 맵을 만들고 템플릿으로 저장하세요.</div>';
      return;
    }
    this.renderTemplatePage(container);
  }

  private renderTemplatePage(container: HTMLElement): void {
    const perPage = App.TEMPLATES_PER_PAGE;
    const totalPages = Math.ceil(this.allTemplates.length / perPage);
    const page = Math.min(this.templatePage, totalPages - 1);
    const start = page * perPage;
    const slice = this.allTemplates.slice(start, start + perPage);

    container.innerHTML = '';

    // Grid
    const grid = document.createElement('div');
    grid.className = 'template-grid';
    for (const t of slice) {
      const card = this.renderTemplateCard(t);
      grid.appendChild(card);
      const canvas = card.querySelector('.template-preview') as HTMLCanvasElement;
      if (t.customMapId) {
        // Custom template: read GridMap from localStorage
        const map = CustomMapStore.get(t.customMapId);
        if (map) this.drawGridPreview(map.gridMap, canvas);
      } else {
        // Built-in template: fetch from /templates/
        this.drawTemplatePreview(t.id, canvas);
      }
    }
    container.appendChild(grid);

    // Pagination (only if more than 1 page)
    if (totalPages <= 1) return;
    const nav = document.createElement('div');
    nav.className = 'template-pagination';

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '←';
    prevBtn.disabled = page === 0;
    prevBtn.addEventListener('click', () => {
      this.templatePage = page - 1;
      this.renderTemplatePage(container);
    });
    nav.appendChild(prevBtn);

    for (let i = 0; i < totalPages; i++) {
      const btn = document.createElement('button');
      btn.textContent = String(i + 1);
      if (i === page) btn.classList.add('active');
      btn.addEventListener('click', () => {
        this.templatePage = i;
        this.renderTemplatePage(container);
      });
      nav.appendChild(btn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.textContent = '→';
    nextBtn.disabled = page === totalPages - 1;
    nextBtn.addEventListener('click', () => {
      this.templatePage = page + 1;
      this.renderTemplatePage(container);
    });
    nav.appendChild(nextBtn);

    container.appendChild(nav);
  }

  private renderTemplateCard(t: { id: string; name: string; description: string; size?: string; recommended?: string; customMapId?: string }): HTMLElement {
    const card = document.createElement('div');
    card.className = 'template-card';

    const canvas = document.createElement('canvas');
    canvas.className = 'template-preview';
    card.appendChild(canvas);

    const body = document.createElement('div');
    body.className = 'card-body';
    body.innerHTML = `<h3></h3><p></p><p class="card-meta"></p>`;
    body.querySelector('h3')!.textContent = t.name;
    body.querySelector('p')!.textContent = t.description;
    const meta: string[] = [];
    if (t.size) meta.push(t.size);
    if (t.recommended) meta.push(`추천 ${t.recommended}`);
    body.querySelector('.card-meta')!.textContent = meta.join(' · ');
    card.appendChild(body);

    if (t.customMapId) {
      // Custom template: click opens editor with this map for exhibition
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.card-btn')) return;
        window.location.href = `/editor/?edit=${encodeURIComponent(t.customMapId!)}`;
      });
      // Actions row
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:0.4rem;padding:0 1rem 0.8rem;';
      const editBtn = document.createElement('a');
      editBtn.className = 'card-btn';
      editBtn.textContent = '맵 편집';
      editBtn.style.cssText = 'font-size:0.7rem;color:#999;border:1px solid #2e2e2e;padding:0.3rem 0.6rem;cursor:pointer;text-decoration:none;transition:all 0.2s;';
      editBtn.href = `/editor/?edit=${encodeURIComponent(t.customMapId!)}`;
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Open in map edit mode (no ?template=, just ?edit= — user toggles to map mode)
      });
      actions.appendChild(editBtn);
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'card-btn danger';
      deleteBtn.textContent = '삭제';
      deleteBtn.style.cssText = 'font-size:0.7rem;color:#999;background:transparent;border:1px solid #2e2e2e;padding:0.3rem 0.6rem;cursor:pointer;transition:all 0.2s;';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`"${t.name}" 템플릿을 삭제할까요?`)) {
          CustomMapStore.delete(t.customMapId!);
          // Re-render picker
          this.showPicker();
        }
      });
      actions.appendChild(deleteBtn);
      card.appendChild(actions);
    } else {
      // Built-in template
      card.addEventListener('click', () => {
        window.location.href = `/editor/?template=${encodeURIComponent(t.id)}`;
      });
    }
    return card;
  }

  private static readonly TILE_COLORS: Record<string, string> = {
    empty: '#0c0c0c',
    floor: '#d4c9ae',
    wall: '#5a5a5a',
    door: '#8B6914',
    artwork: '#4a9eff',
    spawn: '#4eff7e',
  };

  private async drawTemplatePreview(templateId: string, canvas: HTMLCanvasElement): Promise<void> {
    try {
      const res = await fetch(`/templates/${encodeURIComponent(templateId)}.json`);
      if (!res.ok) return;
      this.drawGridPreview(await res.json(), canvas);
    } catch {
      // Silently fail — canvas stays dark
    }
  }

  private drawGridPreview(gridMap: GridMap, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const { width, height, grid } = gridMap;
    const displayW = rect.width;
    const displayH = rect.height;

    const tileSize = Math.min(
      (displayW - 16) / width,
      (displayH - 16) / height,
    );
    const totalW = width * tileSize;
    const totalH = height * tileSize;
    const offsetX = (displayW - totalW) / 2;
    const offsetY = (displayH - totalH) / 2;

    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, 0, displayW, displayH);

    const gap = Math.max(0.5, tileSize * 0.06);
    const colors = App.TILE_COLORS;
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const cell = grid[r]?.[c];
        if (!cell) continue;
        const color = colors[cell.type] ?? colors.empty;
        ctx.fillStyle = color;
        ctx.fillRect(
          offsetX + c * tileSize + gap / 2,
          offsetY + r * tileSize + gap / 2,
          tileSize - gap,
          tileSize - gap,
        );
      }
    }
  }

  private renderCustomCard(map: CustomMap, containerEl: HTMLElement): HTMLElement {
    const card = document.createElement('div');
    card.className = 'exhibition-card';

    const main = document.createElement('div');
    main.className = 'card-main';
    const artCount = map.artworks?.length ?? 0;
    const size = `${map.gridMap.width}×${map.gridMap.height}`;
    const updated = new Date(map.updatedAt).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    main.innerHTML = `<h3></h3><p class="card-meta"></p>`;
    main.querySelector('h3')!.textContent = map.name;
    main.querySelector('.card-meta')!.textContent = `${size} · 작품 ${artCount}개 · ${updated}`;
    main.addEventListener('click', () => {
      this.router.navigateTo(`custom-${map.id}`);
    });
    card.appendChild(main);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'card-btn';
    copyBtn.textContent = '링크 복사';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyLink(`custom-${map.id}`, copyBtn);
    });
    actions.appendChild(copyBtn);

    const qrBtn = document.createElement('button');
    qrBtn.className = 'card-btn';
    qrBtn.textContent = 'QR';
    qrBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showQRCode(`custom-${map.id}`, map.name);
    });
    actions.appendChild(qrBtn);

    const editBtn = document.createElement('a');
    editBtn.className = 'card-btn';
    editBtn.textContent = '편집';
    editBtn.href = `/editor/?edit=${encodeURIComponent(map.id)}`;
    editBtn.target = '_blank';
    editBtn.addEventListener('click', (e) => e.stopPropagation());
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-btn danger';
    deleteBtn.textContent = '삭제';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`"${map.name}" 전시회를 삭제할까요?`)) {
        CustomMapStore.delete(map.id);
        this.refreshCustomList(containerEl);
      }
    });
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    return card;
  }

  // Returns true when a full-screen UI (picker or loading screen) is covering the gallery,
  // so click handlers should not steal pointer lock.
  private isUiBlockingGallery(): boolean {
    const picker = document.getElementById('exhibition-picker');
    if (picker && !picker.classList.contains('hidden')) return true;
    const loading = document.getElementById('loading-screen');
    if (loading && loading.style.display !== 'none' && !loading.classList.contains('hidden')) return true;
    return false;
  }

  private copyLink(exhibitionId: string, btn: HTMLElement): void {
    const url = `${window.location.origin}/#/exhibition/${encodeURIComponent(exhibitionId)}`;
    navigator.clipboard.writeText(url).then(
      () => {
        const original = btn.textContent;
        btn.textContent = '복사됨';
        setTimeout(() => { btn.textContent = original; }, 1500);
      },
      () => { alert(url); }
    );
  }

  private async showQRCode(exhibitionId: string, name: string): Promise<void> {
    const url = `${window.location.origin}/#/exhibition/${encodeURIComponent(exhibitionId)}`;
    let modal = document.getElementById('qr-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'qr-modal';
      modal.innerHTML = `
        <div class="qr-overlay"></div>
        <div class="qr-content">
          <button class="qr-close">&times;</button>
          <h3 class="qr-title"></h3>
          <canvas class="qr-canvas"></canvas>
          <p class="qr-url"></p>
          <p class="qr-hint">스마트폰 카메라로 스캔하여 접속</p>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('.qr-close')!.addEventListener('click', () => modal!.classList.remove('visible'));
      modal.querySelector('.qr-overlay')!.addEventListener('click', () => modal!.classList.remove('visible'));
    }
    (modal.querySelector('.qr-title') as HTMLElement).textContent = name;
    (modal.querySelector('.qr-url') as HTMLElement).textContent = url;
    const canvas = modal.querySelector('.qr-canvas') as HTMLCanvasElement;
    await QRCode.toCanvas(canvas, url, { width: 280, margin: 1, color: { dark: '#fff', light: '#0a0a0a' } });
    modal.classList.add('visible');
  }

  private async loadEditorPreview(): Promise<void> {
    this.loadingScreen.show();
    this.loadingScreen.setTitle('에디터 미리보기');

    const raw = sessionStorage.getItem('editor-map');
    if (!raw) {
      this.loadingScreen.setTitle('오류');
      document.getElementById('loading-status')!.textContent = '맵 데이터가 없습니다. 에디터에서 미리보기를 눌러주세요.';
      return;
    }

    const gridMap: GridMap = JSON.parse(raw);
    const artworksRaw = sessionStorage.getItem('editor-artworks');
    const artworks = artworksRaw ? JSON.parse(artworksRaw) : [];
    const texRaw = sessionStorage.getItem('editor-textures');
    const textures = texRaw ? JSON.parse(texRaw) : null;

    await this.buildTiledGallery({
      gridMap,
      artworks,
      textures,
      configId: 'editor-preview',
      name: '에디터 미리보기',
    });
  }

  private async loadCustomMap(id: string): Promise<void> {
    const map = CustomMapStore.get(id);
    if (!map) {
      this.loadingScreen.show();
      this.loadingScreen.setTitle('오류');
      document.getElementById('loading-status')!.textContent = `맵을 찾을 수 없습니다: ${id}`;
      return;
    }

    this.loadingScreen.show();
    this.loadingScreen.setTitle(map.name);

    await this.buildTiledGallery({
      gridMap: map.gridMap,
      artworks: map.artworks,
      textures: map.textures,
      configId: `custom-${map.id}`,
      name: map.name,
    });
  }

  private async buildTiledGallery(params: {
    gridMap: GridMap;
    artworks: unknown[];
    textures: { floor: string; wall: string; ceiling: string } | null;
    configId: string;
    name: string;
  }): Promise<void> {
    const { gridMap, artworks, textures, configId, name } = params;

    const parser = new TiledMapParser();
    const parsedMap = parser.parse(gridMap);

    const previewConfig = {
      id: configId,
      name,
      description: '',
      roomShape: 'rectangular' as const,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artworks: artworks as any,
    };

    this.tiledBuilder.setOriginalGrid(gridMap.grid);
    if (textures) this.tiledBuilder.setTextureConfig(textures);

    const result = await this.tiledBuilder.build(parsedMap, previewConfig, (loaded, total) =>
      this.loadingScreen.updateProgress(loaded, total)
    );

    this.engine.scene.clear();
    this.engine.scene.add(result.group);
    this.engine.scene.fog = new THREE.Fog(0xf5f5f0, 10, 30);

    const spawn = result.spawnPoint;
    if (spawn) {
      this.engine.camera.position.set(spawn.x, DEFAULTS.EYE_HEIGHT, spawn.z);
    } else {
      this.engine.camera.position.set(result.mapWidth / 2, DEFAULTS.EYE_HEIGHT, -result.mapDepth / 2);
    }

    this.fpControls.setBoundary(null);
    this.tiledCollision = new TiledCollision(result.walkableGrid, result.mapWidth, result.mapDepth);

    this.artworkInteraction.setArtworks(this.tiledBuilder.artworkFrames);

    // Setup minimap with grid + artwork positions
    this.minimap.setup(gridMap, parsedMap.artworkSlots);

    this.loadingScreen.showEnterButton(() => {
      if (this.isMobile) {
        this.touchControls.enable();
        this.hud.show();
      } else {
        this.fpControls.lock();
      }
      this.minimap.show();
      this.autoTour.enable();
    });
  }

  private async loadExhibition(id: string, configUrl?: string): Promise<void> {
    this.loadingScreen.show();
    this.hud.hide();
    if (!this.isMobile) this.fpControls.unlock();

    try {
      const config = await this.loader.load(id, configUrl);
      this.loadingScreen.setTitle(config.nameKo ?? config.name);

      const { group, boundary } = await this.galleryBuilder.build(
        config,
        (loaded, total) => this.loadingScreen.updateProgress(loaded, total)
      );

      this.engine.scene.clear();
      this.engine.scene.add(group);
      this.engine.scene.fog = new THREE.Fog(0xf5f5f0, 15, 40);

      // Set camera to center of room
      this.engine.camera.position.set(0, 1.7, boundary.maxZ * 0.6);
      this.tiledCollision = null;
      this.fpControls.setBoundary(boundary);
      this.touchControls.setBoundary(boundary);

      // Set artworks for interaction
      this.artworkInteraction.setArtworks(this.galleryBuilder.artworkFrames);

      // Show enter button
      this.loadingScreen.showEnterButton(() => {
        if (this.isMobile) {
          this.touchControls.enable();
          this.hud.show();
        } else {
          this.fpControls.lock();
        }
      });
    } catch (err) {
      console.error('Failed to load exhibition:', err);
      this.loadingScreen.setTitle('오류');
      const status = document.getElementById('loading-status')!;
      status.textContent = `전시를 불러올 수 없습니다: ${id}`;
    }
  }
}

new App();
