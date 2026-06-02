// Visitor guestbook entries — per exhibition.
// Adapter contract; swap LocalStorage with API without touching call sites.

export interface GuestbookEntry {
  id: string;
  exhibitionId: string;
  name: string;
  message: string;
  createdAt: string; // ISO timestamp
}

export interface GuestbookDraft {
  exhibitionId: string;
  name: string;
  message: string;
  // Optional — set by import flow to preserve original timestamp
  createdAt?: string;
}

export interface GuestbookStorage {
  list(exhibitionId: string): Promise<GuestbookEntry[]>;
  add(draft: GuestbookDraft): Promise<GuestbookEntry>;
  remove(id: string): Promise<void>;
  count(exhibitionId: string): Promise<number>;
}
