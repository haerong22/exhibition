// UI theme (light / dark). Applied via `data-theme` on <html>.
// CSS variables in index.html / editor/index.html handle the actual color values.

const STORAGE_KEY = 'gallery-theme';

export type Theme = 'light' | 'dark';

class ThemeImpl {
  private current: Theme;
  private listeners: Array<(t: Theme) => void> = [];

  constructor() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      this.current = stored;
    } else {
      // Auto-detect from OS preference
      this.current = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    this.apply();
  }

  get value(): Theme { return this.current; }

  set(t: Theme): void {
    if (this.current === t) return;
    this.current = t;
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* private mode */ }
    this.apply();
    for (const cb of this.listeners) cb(t);
  }

  toggle(): void { this.set(this.current === 'dark' ? 'light' : 'dark'); }

  onChange(cb: (t: Theme) => void): void { this.listeners.push(cb); }

  private apply(): void {
    document.documentElement.setAttribute('data-theme', this.current);
  }
}

export const Theme = new ThemeImpl();
