import { I18n } from '../systems/I18n';
import { GuestbookStore, type GuestbookEntry } from '../systems/GuestbookStore';

const NAME_KEY = 'gallery-guestbook-name';
const PAGE_SIZE = 10;

export class Guestbook {
  private container: HTMLElement;
  private listEl: HTMLElement;
  private nameInput: HTMLInputElement;
  private messageInput: HTMLTextAreaElement;
  private submitBtn: HTMLButtonElement;
  private titleEl: HTMLElement;
  private countEl: HTMLElement;
  private exhibitionId: string | null = null;
  private visibleCount = PAGE_SIZE;
  private searchInput: HTMLInputElement;
  private sortSelect: HTMLSelectElement;
  private searchQuery = '';
  private sortMode: 'newest' | 'oldest' | 'name' = 'newest';

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'guestbook';
    this.container.innerHTML = `
      <div class="gb-backdrop"></div>
      <div class="gb-card">
        <button class="gb-close" aria-label="닫기">&times;</button>
        <div class="gb-header">
          <h2 class="gb-title"></h2>
          <span class="gb-count"></span>
        </div>
        <div class="gb-filters">
          <input class="gb-search" type="search" />
          <select class="gb-sort">
            <option value="newest"></option>
            <option value="oldest"></option>
            <option value="name"></option>
          </select>
        </div>
        <div class="gb-list"></div>
        <form class="gb-form" novalidate>
          <input class="gb-name" type="text" maxlength="40" />
          <textarea class="gb-message" rows="3" maxlength="500"></textarea>
          <button type="submit" class="gb-submit"></button>
        </form>
      </div>
    `;
    document.body.appendChild(this.container);

    this.listEl = this.container.querySelector('.gb-list') as HTMLElement;
    this.nameInput = this.container.querySelector('.gb-name') as HTMLInputElement;
    this.messageInput = this.container.querySelector('.gb-message') as HTMLTextAreaElement;
    this.submitBtn = this.container.querySelector('.gb-submit') as HTMLButtonElement;
    this.titleEl = this.container.querySelector('.gb-title') as HTMLElement;
    this.countEl = this.container.querySelector('.gb-count') as HTMLElement;
    this.searchInput = this.container.querySelector('.gb-search') as HTMLInputElement;
    this.sortSelect = this.container.querySelector('.gb-sort') as HTMLSelectElement;
    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput.value;
      this.visibleCount = PAGE_SIZE;
      void this.refreshList();
    });
    this.sortSelect.addEventListener('change', () => {
      this.sortMode = this.sortSelect.value as 'newest' | 'oldest' | 'name';
      this.visibleCount = PAGE_SIZE;
      void this.refreshList();
    });
    const form = this.container.querySelector('.gb-form') as HTMLFormElement;
    const closeBtn = this.container.querySelector('.gb-close') as HTMLButtonElement;
    const backdrop = this.container.querySelector('.gb-backdrop') as HTMLElement;

    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.close(); });
    backdrop.addEventListener('click', () => this.close());

    // Restore last-used display name
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved) this.nameInput.value = saved;
    } catch { /* private mode */ }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!this.exhibitionId) return;
      const message = this.messageInput.value.trim();
      if (!message) return;
      const name = this.nameInput.value.trim();
      this.submitBtn.disabled = true;
      try {
        const created = await GuestbookStore.add({
          exhibitionId: this.exhibitionId,
          name,
          message,
        });
        try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
        this.messageInput.value = '';
        await this.refreshList(created.id);
      } finally {
        this.submitBtn.disabled = false;
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.code === 'Escape') {
        // Don't close if user is editing inputs and just wants to exit field — only close on form-blank ESC
        const target = e.target as HTMLElement | null;
        if (target && (target === this.nameInput || target === this.messageInput)) {
          target.blur();
          return;
        }
        e.preventDefault();
        this.close();
      }
    });

    this.refreshLabels();
    I18n.onChange(() => this.refreshLabels());
  }

  setExhibitionId(id: string | null): void {
    this.exhibitionId = id;
  }

  async open(): Promise<void> {
    if (!this.exhibitionId) return;
    this.refreshLabels();
    this.visibleCount = PAGE_SIZE; // reset paging each time it opens
    this.searchQuery = '';
    this.searchInput.value = '';
    this.sortMode = 'newest';
    this.sortSelect.value = 'newest';
    await this.refreshList();
    this.container.classList.add('visible');
    // Focus message field for quick entry
    setTimeout(() => this.messageInput.focus(), 50);
  }

  close(): void { this.container.classList.remove('visible'); }
  isOpen(): boolean { return this.container.classList.contains('visible'); }

  private refreshLabels(): void {
    this.titleEl.textContent = I18n.t('guestbook.title');
    this.nameInput.placeholder = I18n.t('guestbook.namePlaceholder');
    this.messageInput.placeholder = I18n.t('guestbook.messagePlaceholder');
    this.submitBtn.textContent = I18n.t('guestbook.submit');
    this.searchInput.placeholder = I18n.t('guestbook.searchPlaceholder');
    const opts = this.sortSelect.options;
    opts[0].textContent = I18n.t('guestbook.sort.newest');
    opts[1].textContent = I18n.t('guestbook.sort.oldest');
    opts[2].textContent = I18n.t('guestbook.sort.name');
  }

  private async refreshList(highlightId?: string): Promise<void> {
    if (!this.exhibitionId) {
      this.listEl.innerHTML = '';
      return;
    }
    const all = await GuestbookStore.list(this.exhibitionId);
    this.countEl.textContent = all.length > 0 ? String(all.length) : '';
    // Hide the filter row when there are no entries at all
    const filters = this.container.querySelector('.gb-filters') as HTMLElement;
    filters.style.display = all.length === 0 ? 'none' : '';
    if (all.length === 0) {
      this.listEl.innerHTML = `<div class="gb-empty">${this.escape(I18n.t('guestbook.empty'))}</div>`;
      return;
    }
    // Apply case-insensitive filter on name + message
    const q = this.searchQuery.trim().toLowerCase();
    let entries = q
      ? all.filter((e) => e.name.toLowerCase().includes(q) || e.message.toLowerCase().includes(q))
      : [...all];
    if (entries.length === 0) {
      this.listEl.innerHTML = `<div class="gb-empty">${this.escape(I18n.t('guestbook.noResults'))}</div>`;
      return;
    }
    // Sort — store returns newest-first by default
    if (this.sortMode === 'oldest') {
      entries.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    } else if (this.sortMode === 'name') {
      entries.sort((a, b) => a.name.localeCompare(b.name));
    }
    // After post: keep current page; newest is at index 0 (for newest sort)
    const visible = entries.slice(0, this.visibleCount);
    this.listEl.innerHTML = '';
    for (const entry of visible) {
      this.listEl.appendChild(this.renderEntry(entry, entry.id === highlightId));
    }
    if (entries.length > this.visibleCount) {
      const moreBtn = document.createElement('button');
      moreBtn.className = 'gb-more';
      moreBtn.type = 'button';
      const remaining = entries.length - this.visibleCount;
      moreBtn.textContent = I18n.t('guestbook.loadMore', { n: Math.min(PAGE_SIZE, remaining) });
      moreBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.visibleCount += PAGE_SIZE;
        await this.refreshList();
      });
      this.listEl.appendChild(moreBtn);
    }
    // Scroll the newest entry into view (it's at the top after the newest-first sort)
    if (highlightId) this.listEl.scrollTop = 0;
  }

  private renderEntry(entry: GuestbookEntry, highlight = false): HTMLElement {
    const row = document.createElement('div');
    row.className = 'gb-entry' + (highlight ? ' gb-entry-new' : '');
    const head = document.createElement('div');
    head.className = 'gb-entry-head';
    const name = document.createElement('span');
    name.className = 'gb-entry-name';
    name.textContent = entry.name;
    const time = document.createElement('time');
    time.className = 'gb-entry-time';
    time.textContent = this.formatTime(entry.createdAt);
    time.title = this.formatFullDateTime(entry.createdAt);
    time.dateTime = entry.createdAt;
    head.appendChild(name);
    head.appendChild(time);
    row.appendChild(head);

    const body = document.createElement('p');
    body.className = 'gb-entry-body';
    body.textContent = entry.message;
    row.appendChild(body);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'gb-entry-remove';
    removeBtn.textContent = '×';
    removeBtn.title = I18n.t('guestbook.remove');
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await GuestbookStore.remove(entry.id);
      await this.refreshList();
    });
    row.appendChild(removeBtn);
    return row;
  }

  private formatTime(iso: string): string {
    const diffMs = Date.now() - Date.parse(iso);
    const min = 60_000, hour = 60 * min, day = 24 * hour;
    if (diffMs < min) return I18n.t('time.justNow');
    if (diffMs < hour) return I18n.t('time.minutesAgo', { n: Math.floor(diffMs / min) });
    if (diffMs < day) return I18n.t('time.hoursAgo', { n: Math.floor(diffMs / hour) });
    if (diffMs < 7 * day) return I18n.t('time.daysAgo', { n: Math.floor(diffMs / day) });
    return new Date(iso).toLocaleDateString(this.localeTag(), {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  }

  // Tooltip — show absolute date + time so users can see exact moment a message was posted
  private formatFullDateTime(iso: string): string {
    return new Date(iso).toLocaleString(this.localeTag(), {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  private localeTag(): string {
    return I18n.current === 'ko' ? 'ko-KR' : 'en-US';
  }

  private escape(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  }
}
