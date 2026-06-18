// Visitor guestbook entries — per exhibition.
// Adapter contract; swap LocalStorage with API without touching call sites.

export interface GuestbookEntry {
  id: string;
  exhibitionId: string;
  name: string;
  message: string;
  createdAt: string; // ISO timestamp
  likes?: number;
  // Optional artwork IDs this entry references
  artworkIds?: string[];
}

export interface GuestbookDraft {
  exhibitionId: string;
  name: string;
  message: string;
  // Optional — set by import flow to preserve original timestamp
  createdAt?: string;
  artworkIds?: string[];
}

export interface GuestbookStorage {
  list(exhibitionId: string): Promise<GuestbookEntry[]>;
  add(draft: GuestbookDraft): Promise<GuestbookEntry>;
  remove(id: string): Promise<void>;
  count(exhibitionId: string): Promise<number>;
  // Adjusts the entry's like count by `delta` (typically +1 or -1) and returns the new count.
  // Caller is responsible for tracking per-device liked state.
  adjustLikes(id: string, delta: number): Promise<number>;
}
