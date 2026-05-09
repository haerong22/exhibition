// Visitor-side favorites: per-exhibition list of starred artwork IDs.
// Stored in localStorage so state persists across visits on the same device.

const STORAGE_KEY = 'gallery-favorites';

type FavoriteData = Record<string, string[]>;

class FavoritesStoreImpl {
  private data: FavoriteData;

  constructor() {
    this.data = this.read();
  }

  private read(): FavoriteData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private write(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Quota / private mode — silently ignore
    }
  }

  isStarred(exhibitionId: string, artworkId: string): boolean {
    return this.data[exhibitionId]?.includes(artworkId) ?? false;
  }

  // Toggle and return the new starred state (true = now starred)
  toggle(exhibitionId: string, artworkId: string): boolean {
    const list = this.data[exhibitionId] ? [...this.data[exhibitionId]] : [];
    const idx = list.indexOf(artworkId);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(artworkId);
    }
    if (list.length === 0) {
      delete this.data[exhibitionId];
    } else {
      this.data[exhibitionId] = list;
    }
    this.write();
    return idx < 0;
  }

  count(exhibitionId: string): number {
    return this.data[exhibitionId]?.length ?? 0;
  }

  list(exhibitionId: string): string[] {
    return [...(this.data[exhibitionId] ?? [])];
  }
}

export const FavoritesStore = new FavoritesStoreImpl();
