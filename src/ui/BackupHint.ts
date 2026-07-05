import { I18n } from '../systems/I18n';

// Keys we consider "user data" worth backing up (matches DataResetModal inventory)
const DATA_KEYS = [
  'custom-maps',
  'gallery-guestbook',
  'gallery-favorites',
  'gallery-guestbook-liked',
];
const DISMISSED_KEY = 'gallery-backup-hint-dismissed';
const THRESHOLD_BYTES = 1024 * 1024; // 1 MB
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // suppress for 7 days after user dismisses

export class BackupHint {
  private container: HTMLElement;
  private onExport: () => void;

  constructor(onExport: () => void) {
    this.onExport = onExport;
    this.container = document.createElement('div');
    this.container.id = 'backup-hint';
    this.container.innerHTML = `
      <div class="bh-icon">💾</div>
      <div class="bh-body">
        <div class="bh-title"></div>
        <div class="bh-desc"></div>
      </div>
      <button class="bh-action" type="button"></button>
      <button class="bh-close" type="button" aria-label="닫기">&times;</button>
    `;
    document.body.appendChild(this.container);

    (this.container.querySelector('.bh-action') as HTMLButtonElement).addEventListener('click', () => {
      this.onExport();
      this.dismiss(false); // don't set the long TTL — user acted
    });
    (this.container.querySelector('.bh-close') as HTMLButtonElement).addEventListener('click', () => {
      this.dismiss(true);
    });

    I18n.onChange(() => { if (this.isVisible()) this.refreshLabels(); });
  }

  // Show the banner if data size exceeds threshold and not recently dismissed
  maybeShow(): void {
    if (this.isRecentlyDismissed()) return;
    const size = this.dataSize();
    if (size < THRESHOLD_BYTES) return;
    this.refreshLabels(size);
    this.container.classList.add('visible');
  }

  hide(): void { this.container.classList.remove('visible'); }
  isVisible(): boolean { return this.container.classList.contains('visible'); }

  private dismiss(remember: boolean): void {
    this.hide();
    if (remember) {
      try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); }
      catch { /* private mode */ }
    }
  }

  private isRecentlyDismissed(): boolean {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      if (!raw) return false;
      const at = parseInt(raw, 10);
      if (!Number.isFinite(at)) return false;
      return Date.now() - at < DISMISS_TTL_MS;
    } catch {
      return false;
    }
  }

  private dataSize(): number {
    let total = 0;
    for (const k of DATA_KEYS) {
      const v = localStorage.getItem(k);
      if (v) total += v.length;
    }
    return total;
  }

  private refreshLabels(precomputedSize?: number): void {
    const size = precomputedSize ?? this.dataSize();
    (this.container.querySelector('.bh-title') as HTMLElement).textContent = I18n.t('backup.hintTitle');
    (this.container.querySelector('.bh-desc') as HTMLElement).textContent = I18n.t('backup.hintDesc', { size: this.humanSize(size) });
    (this.container.querySelector('.bh-action') as HTMLButtonElement).textContent = I18n.t('backup.hintAction');
  }

  private humanSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }
}
