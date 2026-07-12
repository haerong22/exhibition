import { I18n } from '../systems/I18n';

interface DataKey {
  key: string;
  labelKey: string;
  destructive?: boolean; // require extra confirm
}

// Inventory of all localStorage keys this app writes
const KEYS: DataKey[] = [
  { key: 'custom-maps', labelKey: 'data.key.customMaps', destructive: true },
  { key: 'gallery-guestbook', labelKey: 'data.key.guestbook' },
  { key: 'gallery-favorites', labelKey: 'data.key.favorites' },
  { key: 'gallery-guestbook-liked', labelKey: 'data.key.guestbookLiked' },
  { key: 'gallery-guestbook-name', labelKey: 'data.key.guestbookName' },
  { key: 'gallery-last-visit', labelKey: 'data.key.lastVisit' },
  { key: 'gallery-welcome-seen', labelKey: 'data.key.welcomeSeen' },
  { key: 'gallery-guestbook-hint-seen', labelKey: 'data.key.guestbookHintSeen' },
  { key: 'gallery-theme', labelKey: 'data.key.theme' },
  { key: 'gallery-locale', labelKey: 'data.key.locale' },
  { key: 'editor-draft', labelKey: 'data.key.editorDraft' },
  { key: 'gallery-moodboard-history', labelKey: 'data.key.moodboardHistory' },
];

export class DataResetModal {
  private container: HTMLElement;
  private listEl: HTMLElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'data-reset';
    this.container.innerHTML = `
      <div class="dr-backdrop"></div>
      <div class="dr-card">
        <button class="dr-close" aria-label="닫기">&times;</button>
        <h2 class="dr-title"></h2>
        <p class="dr-desc"></p>
        <div class="dr-summary"></div>
        <div class="dr-list"></div>
        <div class="dr-actions">
          <button class="dr-backup" type="button"></button>
          <button class="dr-restore" type="button"></button>
          <button class="dr-reset-all" type="button"></button>
        </div>
        <input type="file" class="dr-restore-input" accept="application/json,.json" hidden />
      </div>
    `;
    document.body.appendChild(this.container);

    this.listEl = this.container.querySelector('.dr-list') as HTMLElement;
    const closeBtn = this.container.querySelector('.dr-close') as HTMLButtonElement;
    const backdrop = this.container.querySelector('.dr-backdrop') as HTMLElement;
    const resetAllBtn = this.container.querySelector('.dr-reset-all') as HTMLButtonElement;
    const backupBtn = this.container.querySelector('.dr-backup') as HTMLButtonElement;
    const restoreBtn = this.container.querySelector('.dr-restore') as HTMLButtonElement;
    const restoreInput = this.container.querySelector('.dr-restore-input') as HTMLInputElement;

    closeBtn.addEventListener('click', () => this.close());
    backdrop.addEventListener('click', () => this.close());
    resetAllBtn.addEventListener('click', () => void this.resetAll());
    backupBtn.addEventListener('click', () => this.backup());
    restoreBtn.addEventListener('click', () => restoreInput.click());
    restoreInput.addEventListener('change', () => {
      const file = restoreInput.files?.[0];
      restoreInput.value = '';
      if (file) void this.restore(file);
    });

    window.addEventListener('keydown', (e) => {
      if (this.isOpen() && e.code === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });

    I18n.onChange(() => { if (this.isOpen()) this.render(); });
  }

  open(): void {
    this.render();
    this.container.classList.add('visible');
  }

  close(): void { this.container.classList.remove('visible'); }
  isOpen(): boolean { return this.container.classList.contains('visible'); }

  private render(): void {
    (this.container.querySelector('.dr-title') as HTMLElement).textContent = I18n.t('data.title');
    (this.container.querySelector('.dr-desc') as HTMLElement).textContent = I18n.t('data.desc');
    (this.container.querySelector('.dr-reset-all') as HTMLButtonElement).textContent = I18n.t('data.resetAll');
    (this.container.querySelector('.dr-backup') as HTMLButtonElement).textContent = I18n.t('data.backup');
    (this.container.querySelector('.dr-restore') as HTMLButtonElement).textContent = I18n.t('data.restore');

    // Aggregate stats first so summary stays in sync with rows
    let totalBytes = 0;
    let usedCount = 0;
    for (const k of KEYS) {
      const v = localStorage.getItem(k.key);
      if (v !== null) {
        totalBytes += v.length;
        usedCount++;
      }
    }
    const summaryEl = this.container.querySelector('.dr-summary') as HTMLElement;
    summaryEl.innerHTML = '';
    if (usedCount === 0) {
      summaryEl.classList.add('empty');
      summaryEl.textContent = I18n.t('data.summary.empty');
    } else {
      summaryEl.classList.remove('empty');
      const total = document.createElement('span');
      total.className = 'dr-summary-total';
      total.textContent = this.humanSize(totalBytes);
      const items = document.createElement('span');
      items.className = 'dr-summary-items';
      items.textContent = I18n.t('data.summary.items', { used: usedCount, total: KEYS.length });
      summaryEl.appendChild(total);
      summaryEl.appendChild(items);
    }

    this.listEl.innerHTML = '';
    for (const k of KEYS) {
      const row = document.createElement('div');
      row.className = 'dr-row';
      const exists = localStorage.getItem(k.key) !== null;
      const sizeStr = exists ? this.humanSize(localStorage.getItem(k.key)!.length) : '—';

      const main = document.createElement('div');
      main.className = 'dr-row-main';
      const label = document.createElement('span');
      label.className = 'dr-row-label';
      label.textContent = I18n.t(k.labelKey);
      const meta = document.createElement('span');
      meta.className = 'dr-row-meta';
      meta.textContent = exists ? sizeStr : I18n.t('data.empty');
      main.appendChild(label);
      main.appendChild(meta);
      row.appendChild(main);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dr-row-btn' + (k.destructive ? ' danger' : '');
      btn.textContent = I18n.t('data.delete');
      btn.disabled = !exists;
      btn.addEventListener('click', () => void this.deleteKey(k));
      row.appendChild(btn);

      this.listEl.appendChild(row);
    }
  }

  private async deleteKey(k: DataKey): Promise<void> {
    if (k.destructive) {
      const ok = confirm(I18n.t('data.confirmDestructive', { name: I18n.t(k.labelKey) }));
      if (!ok) return;
    }
    try { localStorage.removeItem(k.key); } catch { /* ignore */ }
    this.render();
  }

  private async resetAll(): Promise<void> {
    const ok = confirm(I18n.t('data.confirmResetAll'));
    if (!ok) return;
    for (const k of KEYS) {
      try { localStorage.removeItem(k.key); } catch { /* ignore */ }
    }
    this.render();
    // Reload so app picks up clean defaults (locale, theme, etc.)
    setTimeout(() => { window.location.reload(); }, 200);
  }

  // Public: trigger a backup download without opening the modal
  exportBackup(): void { this.backup(); }

  // Download a single JSON envelope with all known keys' values
  private backup(): void {
    const data: Record<string, string> = {};
    for (const k of KEYS) {
      const v = localStorage.getItem(k.key);
      if (v !== null) data[k.key] = v;
    }
    const envelope = {
      format: 'gallery-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
    };
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `gallery-backup-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async restore(file: File): Promise<void> {
    let envelope: unknown;
    try {
      envelope = JSON.parse(await file.text());
    } catch {
      alert(I18n.t('data.restoreInvalid'));
      return;
    }
    if (
      typeof envelope !== 'object' || envelope === null ||
      (envelope as { format?: string }).format !== 'gallery-backup' ||
      typeof (envelope as { data?: unknown }).data !== 'object' ||
      (envelope as { data?: unknown }).data === null
    ) {
      alert(I18n.t('data.restoreInvalid'));
      return;
    }
    const env = envelope as { data: Record<string, unknown>; exportedAt?: string };
    const allowed = new Set(KEYS.map((k) => k.key));
    const entries = Object.entries(env.data).filter(([k, v]) => allowed.has(k) && typeof v === 'string');
    if (entries.length === 0) {
      alert(I18n.t('data.restoreEmpty'));
      return;
    }
    const typedEntries = entries as [string, string][];
    const ok = await this.previewRestore(typedEntries, env.exportedAt, file.name);
    if (!ok) return;
    for (const [k, v] of typedEntries) {
      try { localStorage.setItem(k, v); } catch { /* quota */ }
    }
    this.render();
    setTimeout(() => { window.location.reload(); }, 200);
  }

  // Show a preview dialog listing what will be restored before committing
  private previewRestore(entries: [string, string][], exportedAt: string | undefined, filename: string): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'dr-preview';
      const localeTag = I18n.current === 'ko' ? 'ko-KR' : 'en-US';
      const exportedStr = exportedAt
        ? new Date(exportedAt).toLocaleString(localeTag, {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
          })
        : '—';
      const labelByKey: Record<string, string> = {};
      for (const k of KEYS) labelByKey[k.key] = I18n.t(k.labelKey);
      const totalBytes = entries.reduce((s, [, v]) => s + v.length, 0);

      overlay.innerHTML = `
        <div class="dr-preview-card">
          <h3 class="dr-preview-title"></h3>
          <div class="dr-preview-meta"></div>
          <ul class="dr-preview-list"></ul>
          <div class="dr-preview-warn"></div>
          <div class="dr-preview-actions">
            <button class="dr-preview-cancel" type="button"></button>
            <button class="dr-preview-confirm" type="button"></button>
          </div>
        </div>
      `;
      this.container.appendChild(overlay);

      (overlay.querySelector('.dr-preview-title') as HTMLElement).textContent = I18n.t('data.previewTitle');
      (overlay.querySelector('.dr-preview-meta') as HTMLElement).innerHTML = `
        <div><span class="dr-pm-label">${this.escape(I18n.t('data.preview.file'))}</span><span class="dr-pm-val">${this.escape(filename)}</span></div>
        <div><span class="dr-pm-label">${this.escape(I18n.t('data.preview.exportedAt'))}</span><span class="dr-pm-val">${this.escape(exportedStr)}</span></div>
        <div><span class="dr-pm-label">${this.escape(I18n.t('data.preview.itemCount'))}</span><span class="dr-pm-val">${entries.length} · ${this.humanSize(totalBytes)}</span></div>
      `;
      const list = overlay.querySelector('.dr-preview-list') as HTMLElement;
      for (const [k, v] of entries) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'dr-pl-name';
        name.textContent = labelByKey[k] ?? k;
        const size = document.createElement('span');
        size.className = 'dr-pl-size';
        size.textContent = this.humanSize(v.length);
        li.appendChild(name);
        li.appendChild(size);
        list.appendChild(li);
      }
      (overlay.querySelector('.dr-preview-warn') as HTMLElement).textContent = I18n.t('data.preview.warn');
      const cancelBtn = overlay.querySelector('.dr-preview-cancel') as HTMLButtonElement;
      const confirmBtn = overlay.querySelector('.dr-preview-confirm') as HTMLButtonElement;
      cancelBtn.textContent = I18n.t('data.preview.cancel');
      confirmBtn.textContent = I18n.t('data.preview.confirm');

      const cleanup = (result: boolean) => {
        overlay.remove();
        resolve(result);
      };
      cancelBtn.addEventListener('click', () => cleanup(false));
      confirmBtn.addEventListener('click', () => cleanup(true));
    });
  }

  private escape(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  }

  private humanSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }
}
