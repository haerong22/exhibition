import { LocalStorageFavoritesAdapter } from './favorites/LocalStorageFavoritesAdapter';
// import { ApiFavoritesAdapter } from './favorites/ApiFavoritesAdapter';
import type { FavoritesStorage } from './favorites/types';

export type { FavoritesStorage } from './favorites/types';

// Single binding point — swap to ApiFavoritesAdapter once the backend is ready.
export const FavoritesStore: FavoritesStorage = new LocalStorageFavoritesAdapter();
