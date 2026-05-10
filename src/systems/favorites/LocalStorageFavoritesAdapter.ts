import type { FavoritesStorage } from './types';

const STORAGE_KEY = 'gallery-favorites';

type FavoriteData = Record<string, string[]>;

export class LocalStorageFavoritesAdapter implements FavoritesStorage {
  private read(): FavoriteData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private write(data: FavoriteData): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Quota / private mode — silently ignore
    }
  }

  async isStarred(exhibitionId: string, artworkId: string): Promise<boolean> {
    const data = this.read();
    return data[exhibitionId]?.includes(artworkId) ?? false;
  }

  async toggle(exhibitionId: string, artworkId: string): Promise<boolean> {
    const data = this.read();
    const list = data[exhibitionId] ? [...data[exhibitionId]] : [];
    const idx = list.indexOf(artworkId);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(artworkId);
    }
    if (list.length === 0) {
      delete data[exhibitionId];
    } else {
      data[exhibitionId] = list;
    }
    this.write(data);
    return idx < 0;
  }

  async count(exhibitionId: string): Promise<number> {
    return this.read()[exhibitionId]?.length ?? 0;
  }

  async list(exhibitionId: string): Promise<string[]> {
    return [...(this.read()[exhibitionId] ?? [])];
  }
}
