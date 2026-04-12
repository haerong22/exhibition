import type { GridMap } from '../types/tiled';
import type { TextureConfig } from '../gallery/TiledGalleryBuilder';
import type { ArtworkConfig } from '../types/exhibition';

export interface CustomMap {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  gridMap: GridMap;
  textures: TextureConfig;
  artworks: ArtworkConfig[];
}

const STORAGE_KEY = 'custom-maps';

function readStore(): Record<string, CustomMap> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, CustomMap>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export const CustomMapStore = {
  list(): CustomMap[] {
    return Object.values(readStore()).sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    );
  },

  get(id: string): CustomMap | null {
    return readStore()[id] ?? null;
  },

  save(map: CustomMap): CustomMap {
    const store = readStore();
    const now = new Date().toISOString();
    const updated: CustomMap = {
      ...map,
      createdAt: map.createdAt || now,
      updatedAt: now,
    };
    store[updated.id] = updated;
    writeStore(store);
    return updated;
  },

  delete(id: string): void {
    const store = readStore();
    delete store[id];
    writeStore(store);
  },

  newId(): string {
    return `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  },
};
