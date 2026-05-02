import type { CustomMap, CustomMapType, MapStorage } from './types';

const STORAGE_KEY = 'custom-maps';

export class LocalStorageAdapter implements MapStorage {
  private readStore(): Record<string, CustomMap> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private writeStore(store: Record<string, CustomMap>): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  async list(): Promise<CustomMap[]> {
    return Object.values(this.readStore()).sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    );
  }

  async listByType(type: CustomMapType): Promise<CustomMap[]> {
    const all = await this.list();
    return all.filter((m) => (m.type ?? 'exhibition') === type);
  }

  async get(id: string): Promise<CustomMap | null> {
    return this.readStore()[id] ?? null;
  }

  async save(map: CustomMap): Promise<CustomMap> {
    const store = this.readStore();
    const now = new Date().toISOString();
    const updated: CustomMap = {
      ...map,
      createdAt: map.createdAt || now,
      updatedAt: now,
    };
    store[updated.id] = updated;
    this.writeStore(store);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const store = this.readStore();
    delete store[id];
    this.writeStore(store);
  }

  newId(): string {
    return `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
