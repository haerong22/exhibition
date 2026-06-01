import type { GuestbookDraft, GuestbookEntry, GuestbookStorage } from './types';

const STORAGE_KEY = 'gallery-guestbook';

type Store = Record<string, GuestbookEntry[]>;

export class LocalStorageGuestbookAdapter implements GuestbookStorage {
  private read(): Store {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private write(store: Store): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* quota / private */ }
  }

  private newId(): string {
    return `gb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async list(exhibitionId: string): Promise<GuestbookEntry[]> {
    const all = this.read()[exhibitionId] ?? [];
    return [...all].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async add(draft: GuestbookDraft): Promise<GuestbookEntry> {
    const store = this.read();
    const entry: GuestbookEntry = {
      id: this.newId(),
      exhibitionId: draft.exhibitionId,
      name: draft.name.trim().slice(0, 40) || '익명',
      message: draft.message.trim().slice(0, 500),
      createdAt: new Date().toISOString(),
    };
    const list = store[draft.exhibitionId] ? [...store[draft.exhibitionId]] : [];
    list.push(entry);
    store[draft.exhibitionId] = list;
    this.write(store);
    return entry;
  }

  async remove(id: string): Promise<void> {
    const store = this.read();
    let changed = false;
    for (const key of Object.keys(store)) {
      const filtered = store[key].filter((e) => e.id !== id);
      if (filtered.length !== store[key].length) {
        if (filtered.length === 0) delete store[key];
        else store[key] = filtered;
        changed = true;
      }
    }
    if (changed) this.write(store);
  }

  async count(exhibitionId: string): Promise<number> {
    return this.read()[exhibitionId]?.length ?? 0;
  }
}
