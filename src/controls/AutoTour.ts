import type { ArtworkInteraction } from './ArtworkInteraction';

const DURATION_PER_ARTWORK = 6000; // ms

export class AutoTour {
  private interaction: ArtworkInteraction;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private currentIndex = 0;
  private totalCount = 0;
  private btn: HTMLElement;
  private status: HTMLElement;
  private progressEl: HTMLElement;
  private stopBtn: HTMLElement;
  private onStartCallback: (() => void) | null = null;
  private onStopCallback: (() => void) | null = null;
  private onAdvanceCallback: (() => void) | null = null;

  constructor(interaction: ArtworkInteraction) {
    this.interaction = interaction;
    this.btn = document.getElementById('tour-btn')!;
    this.status = document.getElementById('tour-status')!;
    this.progressEl = document.getElementById('tour-progress')!;
    this.stopBtn = document.getElementById('tour-stop')!;

    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.start();
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
      // Allow toggle if tour UI is visible (button or status)
      const btnVisible = !this.btn.classList.contains('hidden');
      if (!btnVisible && !this.isRunning) return;
      e.preventDefault();
      this.toggle();
    });
  }

  toggle(): void {
    if (this.isRunning) this.stop();
    else this.start();
  }

  // Show "투어 시작" button (called when entering gallery)
  enable(): void {
    if (this.isRunning) return;
    this.btn.classList.remove('hidden');
  }

  disable(): void {
    this.btn.classList.add('hidden');
    this.status.classList.add('hidden');
  }

  start(): void {
    if (this.isRunning) return;
    const total = this.interaction.count();
    if (total === 0) return;
    this.isRunning = true;
    this.currentIndex = 0;
    this.totalCount = total;
    this.btn.classList.add('hidden');
    this.status.classList.remove('hidden');
    this.onStartCallback?.();
    this.advance();
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.status.classList.add('hidden');
    this.btn.classList.remove('hidden');
    this.onStopCallback?.();
  }

  private advance(): void {
    if (!this.isRunning) return;
    this.updateProgress();
    if (this.currentIndex === 0) {
      this.interaction.focusByIndex(0);
    } else {
      this.interaction.next();
    }
    this.onAdvanceCallback?.();
    this.timer = setTimeout(() => {
      this.currentIndex++;
      if (this.currentIndex >= this.totalCount) {
        this.stop();
        return;
      }
      this.advance();
    }, DURATION_PER_ARTWORK);
  }

  private updateProgress(): void {
    this.progressEl.textContent = `투어 ${this.currentIndex + 1} / ${this.totalCount}`;
  }

  get running(): boolean { return this.isRunning; }
  onStart(cb: () => void): void { this.onStartCallback = cb; }
  onStop(cb: () => void): void { this.onStopCallback = cb; }
  onAdvance(cb: () => void): void { this.onAdvanceCallback = cb; }
}
