// Storage backend contract for visitor favorites.
// Replace the implementation (localStorage / API / IndexedDB) without touching call sites —
// they only depend on this interface. All methods are async so the API adapter slots in cleanly.

export interface FavoritesStorage {
  isStarred(exhibitionId: string, artworkId: string): Promise<boolean>;
  // Returns the new starred state (true = now starred, false = unstarred)
  toggle(exhibitionId: string, artworkId: string): Promise<boolean>;
  count(exhibitionId: string): Promise<number>;
  list(exhibitionId: string): Promise<string[]>;
}
