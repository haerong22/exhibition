import type { GridMap } from '../../types/tiled';
import type { TextureConfig } from '../../gallery/TiledGalleryBuilder';
import type { ArtworkConfig } from '../../types/exhibition';

export type CustomMapType = 'template' | 'exhibition';

export interface CustomMap {
  id: string;
  name: string;
  type: CustomMapType;
  createdAt: string;
  updatedAt: string;
  gridMap: GridMap;
  textures: TextureConfig;
  artworks: ArtworkConfig[];
}

// Storage backend contract. Replace the implementation (localStorage / API / IndexedDB / etc.)
// without touching call sites — they only depend on this interface.
export interface MapStorage {
  list(): Promise<CustomMap[]>;
  listByType(type: CustomMapType): Promise<CustomMap[]>;
  get(id: string): Promise<CustomMap | null>;
  save(map: CustomMap): Promise<CustomMap>;
  delete(id: string): Promise<void>;
  // Pure utility — doesn't touch storage, kept on the interface for symmetry
  newId(): string;
}
