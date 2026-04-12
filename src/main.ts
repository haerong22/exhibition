import * as THREE from 'three';
import { Engine } from './core/Engine';
import { CameraController } from './core/Camera';
import { InputManager } from './core/InputManager';
import { FirstPersonControls } from './controls/FirstPersonControls';
import { TouchControls } from './controls/TouchControls';
import { ArtworkInteraction } from './controls/ArtworkInteraction';
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
  private allTemplates: { id: string; name: string; description: string; size?: string; recommended?: string }[] = [];
  private templatePage = 0;
  private static readonly TEMPLATES_PER_PAGE = 6;
  private loader: ExhibitionLoader;
  private router: Router;
  private loadingScreen: LoadingScreen;
  private infoPanel: ArtworkInfoPanel;
  private hud: HUD;

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
    this.artworkInteraction = new ArtworkInteraction(this.engine.camera, this.cameraController);

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
      if (!this.isMobile) this.fpControls.unlock();
    });

    this.artworkInteraction.onArtworkUnfocus(() => {
      this.infoPanel.hide();
    });

    // Info panel close
    this.infoPanel.onClose(() => {
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
    if (!this.isMobile) this.fpControls.unlock();
    this.engine.scene.clear();
    this.engine.scene.fog = null;
    this.tiledCollision = null;

    const picker = document.getElementById('exhibition-picker');
    picker?.classList.remove('hidden');

    const templatesEl = document.getElementById('picker-templates')!;
    const customEl = document.getElementById('picker-custom')!;

    // Templates (tile-based room layouts from /templates/index.json)
    templatesEl.innerHTML = '<div class="picker-empty">불러오는 중...</div>';
    try {
      const res = await fetch('/templates/index.json');
      const templates: { id: string; name: string; description: string; size?: string; recommended?: string }[] = await res.json();
      if (templates.length === 0) {
        templatesEl.innerHTML = '<div class="picker-empty">템플릿이 없습니다</div>';
      } else {
        this.allTemplates = templates;
        this.templatePage = 0;
        this.renderTemplatePage(templatesEl);
      }
    } catch {
      templatesEl.innerHTML = '<div class="picker-empty">템플릿을 불러올 수 없습니다</div>';
    }

    // Custom maps (from localStorage)
    this.refreshCustomList(customEl);
  }

  private refreshCustomList(containerEl: HTMLElement): void {
    const maps = CustomMapStore.list();
    containerEl.innerHTML = '';
    if (maps.length === 0) {
      containerEl.innerHTML = '<div class="picker-empty">저장된 전시회가 없습니다. 템플릿을 선택하여 전시회를 만들어보세요.</div>';
      return;
    }
    for (const map of maps) {
      containerEl.appendChild(this.renderCustomCard(map, containerEl));
    }
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
      this.drawTemplatePreview(t.id, card.querySelector('.template-preview') as HTMLCanvasElement);
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

  private renderTemplateCard(t: { id: string; name: string; description: string; size?: string; recommended?: string }): HTMLElement {
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

    card.addEventListener('click', () => {
      window.location.href = `/editor/?template=${encodeURIComponent(t.id)}`;
    });
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
      const gridMap: GridMap = await res.json();

      // Size canvas to its display dimensions
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);

      const { width, height, grid } = gridMap;
      const displayW = rect.width;
      const displayH = rect.height;

      // Calculate tile size to fit, centered
      const tileSize = Math.min(
        (displayW - 16) / width,
        (displayH - 16) / height,
      );
      const totalW = width * tileSize;
      const totalH = height * tileSize;
      const offsetX = (displayW - totalW) / 2;
      const offsetY = (displayH - totalH) / 2;

      // Background
      ctx.fillStyle = '#0c0c0c';
      ctx.fillRect(0, 0, displayW, displayH);

      // Draw each tile
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
    } catch {
      // Silently fail — canvas stays dark
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

    this.loadingScreen.showEnterButton(() => {
      if (this.isMobile) {
        this.touchControls.enable();
        this.hud.show();
      } else {
        this.fpControls.lock();
      }
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
