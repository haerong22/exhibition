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
import { exportMap, parseImportFile } from './systems/storage/MapExport';
import { FavoritesStore } from './systems/FavoritesStore';
import { GuestbookStore } from './systems/GuestbookStore';
import { I18n } from './systems/I18n';
import { Theme } from './systems/Theme';
import { Router, type Route } from './systems/Router';
import { LoadingScreen } from './ui/LoadingScreen';
import { ArtworkInfoPanel } from './ui/ArtworkInfoPanel';
import { HUD } from './ui/HUD';
import { Minimap } from './ui/Minimap';
import { ShortcutHelp } from './ui/ShortcutHelp';
import { WelcomeGuide } from './ui/WelcomeGuide';
import { Guestbook } from './ui/Guestbook';
import { DataResetModal } from './ui/DataResetModal';
import { BackupHint } from './ui/BackupHint';
import { SoundManager } from './systems/SoundManager';
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
  private templateQuery = '';
  private exhibitionQuery = '';
  private exhibitionSort: 'updated' | 'created' | 'name' | 'popular' = 'updated';
  private static readonly TEMPLATES_PER_PAGE = 6;
  private loader: ExhibitionLoader;
  private router: Router;
  private loadingScreen: LoadingScreen;
  private infoPanel: ArtworkInfoPanel;
  private hud: HUD;
  private minimap: Minimap;
  private autoTour: AutoTour;
  private shortcutHelp: ShortcutHelp;
  private welcomeGuide: WelcomeGuide;
  private guestbook: Guestbook;
  private dataResetModal: DataResetModal;
  private backupHint: BackupHint;
  private soundManager: SoundManager;
  private lastFootstepPos = new THREE.Vector3();
  private currentFavorites: string[] = [];
  private currentExhibitionId: string | null = null;

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
    this.loadingScreen = new LoadingScreen(this.isMobile);
    this.infoPanel = new ArtworkInfoPanel();
    this.hud = new HUD(this.isMobile);
    this.minimap = new Minimap();
    this.artworkInteraction = new ArtworkInteraction(this.engine.camera, this.cameraController);
    this.autoTour = new AutoTour(this.artworkInteraction);
    this.shortcutHelp = new ShortcutHelp(this.isMobile);
    this.welcomeGuide = new WelcomeGuide(this.isMobile);
    this.shortcutHelp.setReplayCallback(() => this.welcomeGuide.show());
    this.guestbook = new Guestbook();
    this.guestbook.onChange(() => void this.refreshMinimapTags());
    this.guestbook.onArtworkJump((artworkId) => {
      const ids = this.artworkInteraction.getArtworkIds();
      const idx = ids.indexOf(artworkId);
      if (idx < 0) return;
      // Stop auto-tour if running so it doesn't override
      if (this.autoTour.running) this.autoTour.stop();
      this.artworkInteraction.focusByIndex(idx);
    });
    this.dataResetModal = new DataResetModal();
    this.backupHint = new BackupHint(() => this.dataResetModal.exportBackup());
    this.soundManager = new SoundManager();
    this.minimap.onTeleport((wx, wz) => this.teleportTo(wx, wz));

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
        // Footstep sounds based on horizontal movement
        const cam = this.engine.camera;
        const dx = cam.position.x - this.lastFootstepPos.x;
        const dz = cam.position.z - this.lastFootstepPos.z;
        const moved = Math.sqrt(dx * dx + dz * dz);
        if (moved > 0) this.soundManager.onMove(moved);
        this.lastFootstepPos.set(cam.position.x, 0, cam.position.z);
      } else {
        this.soundManager.resetStride();
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

    // Sound toggle button
    this.setupSoundButton();
    this.setupLanguageToggle();
    this.setupThemeToggle();
    this.setupScreenshotButton();
    this.setupGuestbookButton();
    this.setupPickerScrollShadow();
    document.getElementById('data-toggle')?.addEventListener('click', () => this.dataResetModal.open());
    this.setupInstallPrompt();

    // Router
    this.router.onRouteChange((route) => {
      this.handleRoute(route);
    });

    // Start
    this.engine.start();
    this.handleRoute(this.router.currentRoute());
  }

  private setupLanguageToggle(): void {
    document.documentElement.lang = I18n.current;
    I18n.applyToDom();
    const btn = document.getElementById('lang-toggle') as HTMLButtonElement | null;
    const refresh = () => {
      if (btn) btn.textContent = I18n.current === 'ko' ? 'EN' : '한';
    };
    refresh();
    btn?.addEventListener('click', () => {
      I18n.toggle();
      refresh();
    });
    I18n.onChange(() => {
      refresh();
      // Re-render picker contents (dynamic strings) if visible
      const picker = document.getElementById('exhibition-picker');
      if (picker && !picker.classList.contains('hidden')) {
        this.showPicker();
      }
    });
  }

  private static readonly LAST_VISIT_KEY = 'gallery-last-visit';

  // Persist last visited exhibition for the quick-resume button
  private recordLastVisit(exhibitionId: string, name: string): void {
    try {
      localStorage.setItem(App.LAST_VISIT_KEY, JSON.stringify({
        id: exhibitionId,
        name,
        at: new Date().toISOString(),
      }));
    } catch { /* private mode */ }
  }

  // Show the resume button if the last-visited exhibition still resolves
  private async refreshResumeButton(): Promise<void> {
    const btn = document.getElementById('resume-btn') as HTMLButtonElement | null;
    if (!btn) return;
    let last: { id: string; name: string; at: string } | null = null;
    try {
      const raw = localStorage.getItem(App.LAST_VISIT_KEY);
      if (raw) last = JSON.parse(raw);
    } catch { /* ignore */ }
    if (!last?.id) { btn.style.display = 'none'; return; }
    // Validate that the target still exists (skip check for built-in IDs)
    if (last.id.startsWith('custom-')) {
      const map = await CustomMapStore.get(last.id.replace(/^custom-/, ''));
      if (!map) { btn.style.display = 'none'; return; }
      last.name = map.name; // refresh in case it was renamed
    }
    btn.innerHTML = '';
    const icon = document.createElement('span');
    icon.className = 'resume-icon';
    icon.textContent = '↻';
    const label = document.createElement('span');
    label.className = 'resume-label';
    label.textContent = I18n.t('picker.resume.label');
    const name = document.createElement('span');
    name.className = 'resume-name';
    name.textContent = last.name;
    btn.appendChild(icon);
    btn.appendChild(label);
    btn.appendChild(name);
    btn.style.display = 'inline-flex';
    btn.onclick = () => { this.router.navigateTo(last!.id); };
  }

  // Capture the deferred PWA install prompt and surface it as a picker button.
  // Chromium fires beforeinstallprompt when the site is installable and not yet installed.
  private setupInstallPrompt(): void {
    const btn = document.getElementById('install-btn') as HTMLButtonElement | null;
    if (!btn) return;
    btn.textContent = I18n.t('btn.install.label');
    I18n.onChange(() => { btn.textContent = I18n.t('btn.install.label'); });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let deferred: any = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      btn.style.display = 'inline-flex';
    });
    btn.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      try {
        await deferred.userChoice;
      } catch { /* dismissed */ }
      deferred = null;
      btn.style.display = 'none';
    });
    window.addEventListener('appinstalled', () => {
      deferred = null;
      btn.style.display = 'none';
    });
  }

  private setupPickerScrollShadow(): void {
    const picker = document.getElementById('exhibition-picker');
    const header = picker?.querySelector('.picker-header') as HTMLElement | null;
    if (!picker || !header) return;
    picker.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', picker.scrollTop > 4);
    }, { passive: true });
  }

  private setupThemeToggle(): void {
    const btn = document.getElementById('theme-toggle') as HTMLButtonElement | null;
    if (!btn) return;
    const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 19.07l1.41-1.41"/><path d="M17.66 6.34l1.41-1.41"/></svg>';
    const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    const refresh = () => {
      // Show the icon for the theme we'd switch to
      btn.innerHTML = Theme.value === 'dark' ? SUN : MOON;
    };
    refresh();
    btn.addEventListener('click', () => {
      Theme.toggle();
      refresh();
    });
    Theme.onChange(refresh);
  }

  private setupSoundButton(): void {
    const btn = document.getElementById('sound-btn') as HTMLButtonElement | null;
    if (!btn) return;
    const ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
    const ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>';
    const refresh = () => {
      btn.innerHTML = this.soundManager.isMuted() ? ICON_OFF : ICON_ON;
    };
    refresh();
    const toggle = () => {
      this.soundManager.ensureContext();
      this.soundManager.setMuted(!this.soundManager.isMuted());
      refresh();
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });
    // M key shortcut — only when in gallery (button visible)
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyM') return;
      if (btn.classList.contains('hidden')) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      e.preventDefault();
      toggle();
    });
  }

  private showSoundButton(): void {
    document.getElementById('sound-btn')?.classList.remove('hidden');
  }

  private hideSoundButton(): void {
    document.getElementById('sound-btn')?.classList.add('hidden');
  }

  private setupGuestbookButton(): void {
    const btn = document.getElementById('guestbook-btn') as HTMLButtonElement | null;
    if (!btn) return;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.guestbook.open();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyG') return;
      if (btn.classList.contains('hidden')) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      this.guestbook.open();
    });
  }

  private showGuestbookButton(): void {
    const btn = document.getElementById('guestbook-btn');
    btn?.classList.remove('hidden');
    this.refreshGuestbookBadge();
    // First-time hint pulse to draw attention to the button location (esp. mobile, no G shortcut)
    const HINT_KEY = 'gallery-guestbook-hint-seen';
    try {
      if (btn && !localStorage.getItem(HINT_KEY)) {
        btn.classList.add('pulse');
        setTimeout(() => btn.classList.remove('pulse'), 5500);
        localStorage.setItem(HINT_KEY, '1');
      }
    } catch { /* private mode */ }
  }

  private hideGuestbookButton(): void {
    document.getElementById('guestbook-btn')?.classList.add('hidden');
  }

  private async refreshGuestbookBadge(): Promise<void> {
    const btn = document.getElementById('guestbook-btn');
    if (!btn || !this.currentExhibitionId) return;
    const count = await GuestbookStore.count(this.currentExhibitionId);
    btn.querySelector('.gb-badge')?.remove();
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'gb-badge';
      badge.textContent = count > 99 ? '99+' : String(count);
      btn.appendChild(badge);
    }
  }

  private setupScreenshotButton(): void {
    const btn = document.getElementById('screenshot-btn') as HTMLButtonElement | null;
    if (!btn) return;
    // Camera icon (Lucide-style)
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.takeScreenshot();
    });
    // Keyboard shortcut: P
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyP') return;
      if (btn.classList.contains('hidden')) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // don't hijack browser print
      e.preventDefault();
      this.takeScreenshot();
    });
  }

  private showScreenshotButton(): void {
    document.getElementById('screenshot-btn')?.classList.remove('hidden');
  }

  private hideScreenshotButton(): void {
    document.getElementById('screenshot-btn')?.classList.add('hidden');
  }

  // Capture the WebGL canvas with all overlays hidden, then trigger a PNG download.
  private async takeScreenshot(): Promise<void> {
    const canvas = this.engine.renderer.domElement;
    // Elements to hide during capture — each restored to its prior state after
    const overlays: Array<{ el: HTMLElement; hiddenClass: string; hadHidden: boolean }> = [];
    const hideClass = (id: string, cls: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      const hadHidden = cls === 'hidden' ? el.classList.contains('hidden') : !el.classList.contains('visible');
      overlays.push({ el, hiddenClass: cls, hadHidden });
      if (cls === 'hidden') el.classList.add('hidden');
      else el.classList.remove('visible');
    };
    hideClass('hud', 'visible');
    hideClass('crosshair', 'visible');
    hideClass('minimap', 'visible');
    hideClass('tour-controls', 'hidden');
    hideClass('sound-btn', 'hidden');
    hideClass('screenshot-btn', 'hidden');

    // Wait one frame so the next render is overlay-free, then capture
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    this.engine.renderer.render(this.engine.scene, this.engine.camera);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));

    // Restore overlay states
    for (const { el, hiddenClass, hadHidden } of overlays) {
      if (hiddenClass === 'hidden') {
        if (!hadHidden) el.classList.remove('hidden');
      } else {
        if (!hadHidden) el.classList.add('visible');
      }
    }

    if (!blob) return;
    // Flash effect on the now-restored UI
    const flash = document.getElementById('screenshot-flash');
    if (flash) {
      flash.classList.remove('flash');
      // Restart animation
      void flash.offsetWidth;
      flash.classList.add('flash');
    }

    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gallery-${ts}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  private async handleRoute(route: Route): Promise<void> {
    const picker = document.getElementById('exhibition-picker');
    if (route.type === 'exhibition') {
      picker?.classList.add('hidden');
      this.backupHint.hide();
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
    this.shortcutHelp.close();
    this.soundManager.resetStride();
    this.hideSoundButton();
    this.hideScreenshotButton();
    this.hideGuestbookButton();
    this.guestbook.close();
    this.guestbook.setExhibitionId(null);
    this.guestbook.setArtworks([]);
    this.infoPanel.setExhibitionId(null);
    this.currentFavorites = [];
    this.currentExhibitionId = null;
    this.autoTour.setFavoritesAvailable(false);
    this.minimap.setFavorites([]);
    this.minimap.setTaggedArtworks([]);
    if (!this.isMobile) this.fpControls.unlock();
    this.engine.scene.clear();
    this.engine.scene.fog = null;
    this.tiledCollision = null;

    const picker = document.getElementById('exhibition-picker');
    picker?.classList.remove('hidden');
    void this.refreshResumeButton();
    this.backupHint.maybeShow();

    const templatesEl = document.getElementById('picker-templates')!;
    const customEl = document.getElementById('picker-custom')!;

    // Fetch built-in templates once
    templatesEl.innerHTML = `<div class="picker-empty">${I18n.t('picker.empty.loading')}</div>`;
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
    const customCount = (await CustomMapStore.listByType('template')).length;
    countEl.textContent = `(${customCount})`;

    // Search / sort wiring
    const tplSearch = document.getElementById('template-search') as HTMLInputElement;
    const exhSearch = document.getElementById('exhibition-search') as HTMLInputElement;
    const exhSort = document.getElementById('exhibition-sort') as HTMLSelectElement;
    tplSearch.value = this.templateQuery;
    exhSearch.value = this.exhibitionQuery;
    exhSort.value = this.exhibitionSort;
    tplSearch.oninput = () => {
      this.templateQuery = tplSearch.value;
      this.templatePage = 0;
      this.renderActiveTab(templatesEl, newTabBuiltin, newTabCustom);
    };
    exhSearch.oninput = () => {
      this.exhibitionQuery = exhSearch.value;
      this.refreshCustomList(customEl);
    };
    exhSort.onchange = () => {
      this.exhibitionSort = exhSort.value as 'updated' | 'created' | 'name' | 'popular';
      this.refreshCustomList(customEl);
    };

    // Import buttons — switch to the matching tab/section after import succeeds
    this.wireImportButton('template-import', 'template', async () => {
      this.templateTab = 'custom';
      this.templatePage = 0;
      await this.renderActiveTab(templatesEl, newTabBuiltin, newTabCustom);
    });
    this.wireImportButton('exhibition-import', 'exhibition', async () => {
      await this.refreshCustomList(customEl);
    });

    // Render active tab
    await this.renderActiveTab(templatesEl, newTabBuiltin, newTabCustom);

    // Exhibitions (from localStorage)
    await this.refreshCustomList(customEl);
  }

  private wireImportButton(buttonId: string, expectedType: 'template' | 'exhibition', onDone: () => Promise<void>): void {
    const btn = document.getElementById(buttonId) as HTMLButtonElement | null;
    const fileInput = document.getElementById('import-file-input') as HTMLInputElement | null;
    if (!btn || !fileInput) return;
    // Replace listeners (showPicker may run multiple times)
    const fresh = btn.cloneNode(true) as HTMLButtonElement;
    btn.replaceWith(fresh);
    fresh.addEventListener('click', () => {
      fileInput.value = '';
      fileInput.onchange = async () => {
        const files = fileInput.files;
        if (!files || files.length === 0) return;
        let imported = 0;
        let rejected = 0;
        const errors: string[] = [];
        for (const file of Array.from(files)) {
          try {
            const result = await parseImportFile(file);
            rejected += result.rejected;
            for (let i = 0; i < result.maps.length; i++) {
              const map = result.maps[i];
              const newMap: CustomMap = { ...map, id: CustomMapStore.newId(), type: expectedType };
              const saved = await CustomMapStore.save(newMap);
              imported++;
              // Restore guestbook entries under the new exhibition id (templates have no guestbook)
              const entries = result.guestbook[i];
              if (entries && expectedType === 'exhibition') {
                const newExhibitionId = `custom-${saved.id}`;
                for (const e of entries) {
                  await GuestbookStore.add({
                    exhibitionId: newExhibitionId,
                    name: e.name,
                    message: e.message,
                    createdAt: e.createdAt,
                  });
                }
              }
            }
          } catch (e) {
            errors.push(`${file.name}: ${(e as Error).message}`);
          }
        }
        await onDone();
        const msgParts = [I18n.t('import.success', { n: imported })];
        if (rejected > 0) msgParts.push(I18n.t('import.rejected', { n: rejected }));
        if (errors.length > 0) msgParts.push(errors.join('\n'));
        alert(msgParts.join('\n'));
      };
      fileInput.click();
    });
  }

  private async refreshCustomList(containerEl: HTMLElement): Promise<void> {
    const all = await CustomMapStore.listByType('exhibition');
    // Apply search filter
    const q = this.exhibitionQuery.trim().toLowerCase();
    const filtered = q ? all.filter((m) => m.name.toLowerCase().includes(q)) : all;
    // Apply sort — popularity requires async fetches, others are sync on map fields
    let sorted: typeof filtered;
    if (this.exhibitionSort === 'popular') {
      // Score = guestbook entry count + total likes (per exhibition)
      const scored = await Promise.all(filtered.map(async (m) => {
        const entries = await GuestbookStore.list(`custom-${m.id}`);
        const score = entries.length + entries.reduce((s, e) => s + (e.likes ?? 0), 0);
        return { m, score };
      }));
      // Higher score first; tiebreak by latest updated
      scored.sort((a, b) => b.score - a.score || Date.parse(b.m.updatedAt) - Date.parse(a.m.updatedAt));
      sorted = scored.map((x) => x.m);
    } else {
      sorted = [...filtered].sort((a, b) => {
        switch (this.exhibitionSort) {
          case 'created': return Date.parse(b.createdAt) - Date.parse(a.createdAt);
          case 'name': return a.name.localeCompare(b.name);
          case 'updated':
          default: return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        }
      });
    }

    containerEl.innerHTML = '';
    if (sorted.length === 0) {
      const key = all.length === 0 ? 'picker.empty.noExhibitions' : 'picker.empty.noResults';
      containerEl.innerHTML = `<div class="picker-empty">${I18n.t(key)}</div>`;
      return;
    }
    // Render in parallel — favorite counts are async, so awaiting one-by-one would serialize them
    const cards = await Promise.all(sorted.map((map) => this.renderCustomCard(map, containerEl)));
    for (const card of cards) containerEl.appendChild(card);
  }

  private async renderActiveTab(container: HTMLElement, tabBuiltin: HTMLElement, tabCustom: HTMLElement): Promise<void> {
    // Update tab active state
    tabBuiltin.classList.toggle('active', this.templateTab === 'builtin');
    tabCustom.classList.toggle('active', this.templateTab === 'custom');

    // Update custom count
    const customCount = (await CustomMapStore.listByType('template')).length;
    const countEl = tabCustom.querySelector('.tab-count') ?? document.getElementById('tab-custom-count');
    if (countEl) countEl.textContent = `(${customCount})`;

    if (this.templateTab === 'builtin') {
      this.allTemplates = this.builtInTemplates.map((t) => ({ ...t, customMapId: undefined as string | undefined }));
    } else {
      const customTemplates = await CustomMapStore.listByType('template');
      this.allTemplates = customTemplates.map((m) => ({
        id: m.id,
        name: m.name,
        description: I18n.t('card.meta.customTemplate'),
        size: `${m.gridMap.width}×${m.gridMap.height}`,
        recommended: undefined as string | undefined,
        customMapId: m.id,
      }));
    }

    // Apply search filter
    const q = this.templateQuery.trim().toLowerCase();
    if (q) {
      this.allTemplates = this.allTemplates.filter((t) =>
        t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
    }

    if (this.allTemplates.length === 0) {
      const key = q
        ? 'picker.empty.noResults'
        : this.templateTab === 'builtin' ? 'picker.empty.noTemplates' : 'picker.empty.noCustomTemplates';
      container.innerHTML = `<div class="picker-empty">${I18n.t(key)}</div>`;
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
        // Custom template: read GridMap from storage
        CustomMapStore.get(t.customMapId).then((map) => {
          if (map) this.drawGridPreview(map.gridMap, canvas);
        });
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
    if (t.recommended) meta.push(I18n.t('card.meta.recommended', { label: t.recommended }));
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
      editBtn.textContent = I18n.t('card.btn.editMap');
      editBtn.style.cssText = 'font-size:0.7rem;color:#999;border:1px solid #2e2e2e;padding:0.3rem 0.6rem;cursor:pointer;text-decoration:none;transition:all 0.2s;';
      editBtn.href = `/editor/?edit=${encodeURIComponent(t.customMapId!)}`;
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Open in map edit mode (no ?template=, just ?edit= — user toggles to map mode)
      });
      actions.appendChild(editBtn);
      const exportBtn = document.createElement('button');
      exportBtn.className = 'card-btn';
      exportBtn.textContent = I18n.t('card.btn.export');
      exportBtn.style.cssText = 'font-size:0.7rem;color:#999;background:transparent;border:1px solid #2e2e2e;padding:0.3rem 0.6rem;cursor:pointer;transition:all 0.2s;';
      exportBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const map = await CustomMapStore.get(t.customMapId!);
        if (map) await exportMap(map);
      });
      actions.appendChild(exportBtn);
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'card-btn danger';
      deleteBtn.textContent = I18n.t('card.btn.delete');
      deleteBtn.style.cssText = 'font-size:0.7rem;color:#999;background:transparent;border:1px solid #2e2e2e;padding:0.3rem 0.6rem;cursor:pointer;transition:all 0.2s;';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(I18n.t('confirm.deleteTemplate', { name: t.name }))) {
          await CustomMapStore.delete(t.customMapId!);
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

  // Build a small thumbnail for an exhibition card. Prefers the first artwork's image,
  // falls back to a grid mini-preview if there are no artworks.
  private renderCustomCardThumb(map: CustomMap): HTMLElement {
    const thumb = document.createElement('div');
    thumb.className = 'card-thumb';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstArt = (map.artworks as any[] | undefined)?.find((a) => a && a.imageUrl);
    if (firstArt?.imageUrl) {
      const img = document.createElement('img');
      img.src = firstArt.imageUrl as string;
      img.loading = 'lazy';
      img.alt = '';
      // If the image fails, swap in a grid preview canvas
      img.onerror = () => {
        thumb.innerHTML = '';
        const canvas = document.createElement('canvas');
        thumb.appendChild(canvas);
        // Defer so layout settles and getBoundingClientRect returns a real size
        requestAnimationFrame(() => this.drawGridPreview(map.gridMap, canvas));
      };
      thumb.appendChild(img);
    } else {
      const canvas = document.createElement('canvas');
      thumb.appendChild(canvas);
      requestAnimationFrame(() => this.drawGridPreview(map.gridMap, canvas));
    }
    return thumb;
  }

  private async renderCustomCard(map: CustomMap, containerEl: HTMLElement): Promise<HTMLElement> {
    const card = document.createElement('div');
    card.className = 'exhibition-card';

    // Thumbnail: prefer first artwork image, fall back to grid mini-preview
    const thumb = this.renderCustomCardThumb(map);
    thumb.addEventListener('click', () => this.router.navigateTo(`custom-${map.id}`));
    card.appendChild(thumb);

    const main = document.createElement('div');
    main.className = 'card-main';
    const artCount = map.artworks?.length ?? 0;
    const size = `${map.gridMap.width}×${map.gridMap.height}`;
    const updated = new Date(map.updatedAt).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    main.innerHTML = `<h3></h3><p class="card-meta"></p><div class="card-stats"></div><p class="card-guestbook"></p>`;
    main.querySelector('h3')!.textContent = map.name;
    const exhibitionId = `custom-${map.id}`;
    const [favCount, gbEntries] = await Promise.all([
      FavoritesStore.count(exhibitionId),
      GuestbookStore.list(exhibitionId),
    ]);
    // Base meta: dimensions / artwork count / updated date
    const metaParts = [size, I18n.t('card.meta.artworkCount', { n: artCount }), updated];
    main.querySelector('.card-meta')!.textContent = metaParts.join(' · ');

    // Icon stats as pills (only those with non-zero counts)
    const statsEl = main.querySelector('.card-stats') as HTMLElement;
    const stats: { icon: string; n: number; cls: string }[] = [];
    if (favCount > 0) stats.push({ icon: '★', n: favCount, cls: 'fav' });
    if (gbEntries.length > 0) stats.push({ icon: '💬', n: gbEntries.length, cls: 'gb' });
    const totalLikes = gbEntries.reduce((sum, e) => sum + (e.likes ?? 0), 0);
    if (totalLikes > 0) stats.push({ icon: '♥', n: totalLikes, cls: 'like' });
    if (stats.length === 0) {
      statsEl.remove();
    } else {
      for (const s of stats) {
        const pill = document.createElement('span');
        pill.className = `card-stat card-stat-${s.cls}`;
        pill.textContent = `${s.icon} ${s.n}`;
        statsEl.appendChild(pill);
      }
    }

    // Latest guestbook snippet (single line, ellipsised). Hidden if no entries.
    const gbEl = main.querySelector('.card-guestbook') as HTMLElement;
    if (gbEntries.length > 0) {
      const latest = gbEntries[0]; // list() returns newest-first
      gbEl.textContent = `“${latest.message}” — ${latest.name}`;
    } else {
      gbEl.remove();
    }
    main.addEventListener('click', () => {
      this.router.navigateTo(`custom-${map.id}`);
    });
    card.appendChild(main);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'card-btn';
    copyBtn.textContent = I18n.t('card.btn.copyLink');
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyLink(`custom-${map.id}`, copyBtn);
    });
    actions.appendChild(copyBtn);

    const qrBtn = document.createElement('button');
    qrBtn.className = 'card-btn';
    qrBtn.textContent = I18n.t('card.btn.qr');
    qrBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showQRCode(`custom-${map.id}`, map.name);
    });
    actions.appendChild(qrBtn);

    const editBtn = document.createElement('a');
    editBtn.className = 'card-btn';
    editBtn.textContent = I18n.t('card.btn.edit');
    editBtn.href = `/editor/?edit=${encodeURIComponent(map.id)}`;
    editBtn.target = '_blank';
    editBtn.addEventListener('click', (e) => e.stopPropagation());
    actions.appendChild(editBtn);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'card-btn';
    exportBtn.textContent = I18n.t('card.btn.export');
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void exportMap(map);
    });
    actions.appendChild(exportBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-btn danger';
    deleteBtn.textContent = I18n.t('card.btn.delete');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(I18n.t('confirm.deleteExhibition', { name: map.name }))) {
        await CustomMapStore.delete(map.id);
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
        btn.textContent = I18n.t('card.btn.copied');
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
          <p class="qr-hint">${I18n.t('qr.hint')}</p>
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
    this.loadingScreen.setTitle(I18n.t('loading.title.editorPreview'));

    const raw = sessionStorage.getItem('editor-map');
    if (!raw) {
      this.loadingScreen.setTitle(I18n.t('loading.error.title'));
      document.getElementById('loading-status')!.textContent = I18n.t('loading.error.noMapData');
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
    const map = await CustomMapStore.get(id);
    if (!map) {
      this.loadingScreen.show();
      this.loadingScreen.setTitle(I18n.t('loading.error.title'));
      document.getElementById('loading-status')!.textContent = I18n.t('loading.error.mapNotFound', { id });
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
      description: map.description,
      artist: map.artist,
      curator: map.curator,
    });
  }

  private async buildTiledGallery(params: {
    gridMap: GridMap;
    artworks: unknown[];
    textures: { floor: string; wall: string; ceiling: string } | null;
    configId: string;
    name: string;
    description?: string;
    artist?: string;
    curator?: string;
  }): Promise<void> {
    const { gridMap, artworks, textures, configId, name, description, artist, curator } = params;
    this.loadingScreen.setDescription(description);
    this.loadingScreen.setCredits({ artist, curator });
    // Engagement stats — fetch in parallel, fall back to 0 on any error
    const [favCount, gbEntries] = await Promise.all([
      FavoritesStore.count(configId).catch(() => 0),
      GuestbookStore.list(configId).catch(() => []),
    ]);
    const likesTotal = gbEntries.reduce((s, e) => s + (e.likes ?? 0), 0);
    this.loadingScreen.setMeta({
      artworkCount: artworks?.length ?? 0,
      width: gridMap.width,
      height: gridMap.height,
      favorites: favCount,
      guestbook: gbEntries.length,
      likes: likesTotal,
    });

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

    // Stage 1: 공간 구조 생성 (0-30%)
    this.loadingScreen.setStage(I18n.t('loading.stage.spaceStructure'), 0, 0.3);
    await new Promise((r) => setTimeout(r, 50)); // let UI update

    // Stage 2: 텍스처/작품 로딩 (30-90%)
    this.loadingScreen.setStage(I18n.t('loading.stage.texturesArtworks'), 0.3, 0.9);
    const result = await this.tiledBuilder.build(parsedMap, previewConfig, (loaded, total) =>
      this.loadingScreen.updateProgress(loaded, total)
    );

    // Stage 3: 씬 구성 (90-100%)
    this.loadingScreen.setStage(I18n.t('loading.stage.composing'), 0.9, 1.0);
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
    this.infoPanel.setExhibitionId(configId);
    this.guestbook.setExhibitionId(configId);
    this.guestbook.setArtworks(this.tiledBuilder.artworkFrames.map((f) => f.config));
    this.currentExhibitionId = configId;
    await this.wireFavoritesTour(configId);
    await this.refreshMinimapTags();
    this.recordLastVisit(configId, name);

    // Setup minimap with grid + artwork positions
    this.minimap.setup(gridMap, parsedMap.artworkSlots);

    this.loadingScreen.showEnterButton(() => this.startGallerySession({ withMinimap: true, withTour: true }));
  }

  // Set up the "favorites tour" button: resolver maps starred IDs → indices in the
  // current artwork order, refresh visibility based on count. Also re-checks count
  // whenever the user toggles a star from the info panel.
  private async wireFavoritesTour(exhibitionId: string): Promise<void> {
    const refresh = async () => {
      const count = await FavoritesStore.count(exhibitionId);
      this.autoTour.setFavoritesAvailable(count > 0);
      this.minimap.setFavorites(this.currentFavorites);
    };
    this.autoTour.setFavoritesResolver(() => {
      const ids = this.artworkInteraction.getArtworkIds();
      // Re-read synchronously — adapter may be async, but LocalStorageFavoritesAdapter
      // is effectively sync; we resolve immediately via cached state in main.ts
      const starredSet = new Set(this.currentFavorites);
      const indices: number[] = [];
      ids.forEach((id, idx) => {
        if (starredSet.has(id)) indices.push(idx);
      });
      return indices;
    });
    this.currentFavorites = await FavoritesStore.list(exhibitionId);
    this.infoPanel.onFavoriteChange(async (artworkId, starred) => {
      // Maintain local cache + refresh button availability + minimap markers
      const set = new Set(this.currentFavorites);
      if (starred) set.add(artworkId); else set.delete(artworkId);
      this.currentFavorites = Array.from(set);
      await refresh();
    });
    await refresh();
  }

  // Collect artwork IDs referenced by guestbook entries → minimap rings
  private async refreshMinimapTags(): Promise<void> {
    if (!this.currentExhibitionId) {
      this.minimap.setTaggedArtworks([]);
      return;
    }
    const entries = await GuestbookStore.list(this.currentExhibitionId).catch(() => []);
    const tagged = new Set<string>();
    for (const e of entries) {
      if (e.artworkIds) for (const id of e.artworkIds) tagged.add(id);
    }
    this.minimap.setTaggedArtworks(tagged);
  }

  private teleportTo(worldX: number, worldZ: number): boolean {
    // Only allow while walking (not during artwork transitions / viewing)
    if (this.cameraController.state !== 'WALKING') return false;
    if (!this.tiledCollision) return false;
    if (!this.tiledCollision.isWalkable(worldX, worldZ)) return false;
    const cam = this.engine.camera;
    cam.position.x = worldX;
    cam.position.z = worldZ;
    // Re-snap footstep tracking origin so we don't emit a giant fake step
    this.lastFootstepPos.set(cam.position.x, 0, cam.position.z);
    this.soundManager.resetStride();
    return true;
  }

  private startGallerySession(opts: { withMinimap: boolean; withTour: boolean }): void {
    this.playEntryFade();
    if (this.isMobile) {
      this.touchControls.enable();
      this.hud.show();
    } else {
      this.fpControls.lock();
    }
    if (opts.withMinimap) this.minimap.show();
    if (opts.withTour) this.autoTour.enable();
    this.lastFootstepPos.set(this.engine.camera.position.x, 0, this.engine.camera.position.z);
    this.soundManager.ensureContext();
    this.showSoundButton();
    this.showScreenshotButton();
    this.showGuestbookButton();
    // First-time visitor: show welcome guide after the entry fade settles
    if (!this.welcomeGuide.hasSeen()) {
      setTimeout(() => this.welcomeGuide.show(), 1600);
    }
  }

  // Black overlay that covers immediately, then fades to transparent (1.4s) for a cinematic reveal
  private playEntryFade(): void {
    const fade = document.getElementById('scene-fade');
    if (!fade) return;
    fade.classList.remove('reveal');
    fade.classList.add('cover');
    // Two RAFs to ensure the cover class is committed before the reveal class triggers the transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fade.classList.add('reveal');
      });
    });
    setTimeout(() => {
      fade.classList.remove('cover');
      fade.classList.remove('reveal');
    }, 1500);
  }

  private async loadExhibition(id: string, configUrl?: string): Promise<void> {
    this.loadingScreen.show();
    this.hud.hide();
    if (!this.isMobile) this.fpControls.unlock();

    try {
      this.loadingScreen.setStage(I18n.t('loading.stage.fetchingInfo'), 0, 0.15);
      const config = await this.loader.load(id, configUrl);
      this.loadingScreen.setTitle(I18n.pick(config.name, config.nameKo));
      this.loadingScreen.setDescription(I18n.pick(config.description, config.descriptionKo));
      this.loadingScreen.setCredits({ artist: config.artist, curator: config.curator });
      const [bfav, bgb] = await Promise.all([
        FavoritesStore.count(config.id).catch(() => 0),
        GuestbookStore.list(config.id).catch(() => []),
      ]);
      const blikes = bgb.reduce((s, e) => s + (e.likes ?? 0), 0);
      this.loadingScreen.setMeta({
        artworkCount: config.artworks?.length ?? 0,
        width: config.roomWidth,
        height: config.roomDepth,
        favorites: bfav,
        guestbook: bgb.length,
        likes: blikes,
      });

      this.loadingScreen.setStage(I18n.t('loading.stage.texturesArtworks'), 0.15, 0.9);
      const { group, boundary } = await this.galleryBuilder.build(
        config,
        (loaded, total) => this.loadingScreen.updateProgress(loaded, total)
      );

      this.loadingScreen.setStage(I18n.t('loading.stage.composing'), 0.9, 1.0);
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
      this.infoPanel.setExhibitionId(config.id);
      this.guestbook.setExhibitionId(config.id);
      this.guestbook.setArtworks(this.galleryBuilder.artworkFrames.map((f) => f.config));
      this.currentExhibitionId = config.id;
      this.recordLastVisit(config.id, I18n.pick(config.name, config.nameKo));
      await this.wireFavoritesTour(config.id);

      // Show enter button
      this.loadingScreen.showEnterButton(() => this.startGallerySession({ withMinimap: false, withTour: false }));
    } catch (err) {
      console.error('Failed to load exhibition:', err);
      this.loadingScreen.setTitle(I18n.t('loading.error.title'));
      const status = document.getElementById('loading-status')!;
      status.textContent = I18n.t('loading.error.notFound', { id });
    }
  }
}

new App();
