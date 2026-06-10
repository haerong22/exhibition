import type { GuestbookDraft, GuestbookEntry, GuestbookStorage } from './types';

// Stub adapter for a future REST API. Fill in the endpoints when the backend is ready.
export class ApiGuestbookAdapter implements GuestbookStorage {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async list(exhibitionId: string): Promise<GuestbookEntry[]> {
    const res = await fetch(
      `${this.baseUrl}/guestbook/${encodeURIComponent(exhibitionId)}`,
      { credentials: 'include' },
    );
    if (!res.ok) throw new Error(`list failed: ${res.status}`);
    return res.json();
  }

  async add(draft: GuestbookDraft): Promise<GuestbookEntry> {
    const res = await fetch(
      `${this.baseUrl}/guestbook/${encodeURIComponent(draft.exhibitionId)}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name, message: draft.message }),
      },
    );
    if (!res.ok) throw new Error(`add failed: ${res.status}`);
    return res.json();
  }

  async remove(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/guestbook/entries/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok && res.status !== 404) throw new Error(`remove failed: ${res.status}`);
  }

  async count(exhibitionId: string): Promise<number> {
    const res = await fetch(
      `${this.baseUrl}/guestbook/${encodeURIComponent(exhibitionId)}/count`,
      { credentials: 'include' },
    );
    if (!res.ok) throw new Error(`count failed: ${res.status}`);
    return res.json();
  }

  async adjustLikes(id: string, delta: number): Promise<number> {
    const res = await fetch(
      `${this.baseUrl}/guestbook/entries/${encodeURIComponent(id)}/likes`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      },
    );
    if (!res.ok) throw new Error(`adjustLikes failed: ${res.status}`);
    return res.json();
  }
}
