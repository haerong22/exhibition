import * as THREE from 'three';
import { Engine } from './core/Engine';
import { CameraController } from './core/Camera';
import { InputManager } from './core/InputManager';
import { FirstPersonControls } from './controls/FirstPersonControls';
import { TouchControls } from './controls/TouchControls';
import { ArtworkInteraction } from './controls/ArtworkInteraction';
import { GalleryBuilder } from './gallery/GalleryBuilder';
import { TextureManager } from './systems/TextureManager';
import { ExhibitionLoader } from './systems/ExhibitionLoader';
import { Router } from './systems/Router';
import { LoadingScreen } from './ui/LoadingScreen';
import { ArtworkInfoPanel } from './ui/ArtworkInfoPanel';
import { HUD } from './ui/HUD';

class App {
  private engine: Engine;
  private cameraController: CameraController;
  private input: InputManager;
  private fpControls: FirstPersonControls;
  private touchControls: TouchControls;
  private isMobile: boolean;
  private artworkInteraction: ArtworkInteraction;
  private galleryBuilder: GalleryBuilder;
  private textureManager: TextureManager;
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
      }
    });

    // Desktop: click interaction
    this.input.onClick(() => {
      if (this.isMobile) return;

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
      if (route.type === 'exhibition') {
        this.loadExhibition(route.exhibitionId ?? 'default', route.configUrl);
      }
    });

    // Start
    this.engine.start();
    this.handleInitialRoute();
  }

  private async handleInitialRoute(): Promise<void> {
    const route = this.router.currentRoute();
    if (route.type === 'exhibition') {
      await this.loadExhibition(route.exhibitionId ?? 'default', route.configUrl);
    } else {
      await this.loadExhibition('moodboard');
    }
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
