import type { ArtworkInteraction } from './ArtworkInteraction';
import { I18n } from '../systems/I18n';

const DURATION_PER_ARTWORK = 6000; // ms

export class AutoTour {
  private interaction: ArtworkInteraction;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private currentStep = 0;
  private indices: number[] = [];
  private mode: 'all' | 'favorites' = 'all';
  private controls: HTMLElement;
  private btn: HTMLElement;
  private favBtn: HTMLElement;
  private status: HTMLElement;
  private progressEl: HTMLElement;
  private stopBtn: HTMLElement;
  private favoritesResolver: (() => number[]) | null = null;
  private onStartCallback: (() => void) | null = null;
  private onStopCallback: (() => void) | null = null;
  private onAdvanceCallback: (() => void) | null = null;

  constructor(interaction: ArtworkInteraction) {
    this.interaction = interaction;
    this.controls = document.getElementById('tour-controls')!;
    this.btn = document.getElementById('tour-btn')!;
    this.favBtn = document.getElementById('fav-tour-btn')!;
    this.status = document.getElementById('tour-status')!;
    this.progressEl = document.getElementById('tour-progress')!;
    this.stopBtn = document.getElementById('tour-stop')!;

    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startAll();
    });
    this.favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startFavorites();
    });
    this.stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stop();
    });

    // Keyboard shortcut: T to toggle tour (only when tour UI is enabled)
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyT') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const uiVisible = !this.controls.classList.contains('hidden');
      if (!uiVisible && !this.isRunning) return;
      e.preventDefault();
      this.toggle();
    });
  }

  // Resolver returns the set of artwork indices considered "favorite" right now.
  // Called each time a favorites tour begins so the list reflects current state.
  setFavoritesResolver(fn: () => number[]): void {
    this.favoritesResolver = fn;
  }

  setFavoritesAvailable(available: boolean): void {
    this.favBtn.classList.toggle('hidden', !available);
  }

  toggle(): void {
    if (this.isRunning) this.stop();
    else this.startAll();
  }

  enable(): void {
    if (this.isRunning) return;
    this.controls.classList.remove('hidden');
  }

  disable(): void {
    this.controls.classList.add('hidden');
    this.status.classList.add('hidden');
  }

  startAll(): void {
    const total = this.interaction.count();
    const indices = Array.from({ length: total }, (_, i) => i);
    this.beginTour(indices, 'all');
  }

  startFavorites(): void {
    if (!this.favoritesResolver) return;
    const indices = this.favoritesResolver();
    if (indices.length === 0) return;
    this.beginTour(indices, 'favorites');
  }

  private beginTour(indices: number[], mode: 'all' | 'favorites'): void {
    if (this.isRunning) return;
    if (indices.length === 0) return;
    this.isRunning = true;
    this.indices = indices;
    this.mode = mode;
    this.currentStep = 0;
    this.controls.classList.add('hidden');
    this.status.classList.remove('hidden');
    this.onStartCallback?.();
    this.advance();
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.status.classList.add('hidden');
    this.controls.classList.remove('hidden');
    this.onStopCallback?.();
  }

  private advance(): void {
    if (!this.isRunning) return;
    this.updateProgress();
    const idx = this.indices[this.currentStep];
    this.interaction.focusByIndex(idx);
    this.onAdvanceCallback?.();
    this.timer = setTimeout(() => {
      this.currentStep++;
      if (this.currentStep >= this.indices.length) {
        this.stop();
        return;
      }
      this.advance();
    }, DURATION_PER_ARTWORK);
  }

  private updateProgress(): void {
    const key = this.mode === 'favorites' ? 'tour.progress.favorites' : 'tour.progress';
    this.progressEl.textContent = I18n.t(key, { current: this.currentStep + 1, total: this.indices.length });
  }

  get running(): boolean { return this.isRunning; }
  onStart(cb: () => void): void { this.onStartCallback = cb; }
  onStop(cb: () => void): void { this.onStopCallback = cb; }
  onAdvance(cb: () => void): void { this.onAdvanceCallback = cb; }
}
