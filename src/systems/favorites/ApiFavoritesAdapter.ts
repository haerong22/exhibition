import type { FavoritesStorage } from './types';

// Stub adapter for a future REST API. Fill in the endpoints when the backend is ready.
export class ApiFavoritesAdapter implements FavoritesStorage {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async isStarred(exhibitionId: string, artworkId: string): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/favorites/${encodeURIComponent(exhibitionId)}/${encodeURIComponent(artworkId)}`,
      { credentials: 'include' },
    );
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`isStarred failed: ${res.status}`);
    return res.json();
  }

  async toggle(exhibitionId: string, artworkId: string): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/favorites/${encodeURIComponent(exhibitionId)}/${encodeURIComponent(artworkId)}/toggle`,
      { method: 'POST', credentials: 'include' },
    );
    if (!res.ok) throw new Error(`toggle failed: ${res.status}`);
    return res.json();
  }

  async count(exhibitionId: string): Promise<number> {
    const res = await fetch(
      `${this.baseUrl}/favorites/${encodeURIComponent(exhibitionId)}/count`,
      { credentials: 'include' },
    );
    if (!res.ok) throw new Error(`count failed: ${res.status}`);
    return res.json();
  }

  async list(exhibitionId: string): Promise<string[]> {
    const res = await fetch(
      `${this.baseUrl}/favorites/${encodeURIComponent(exhibitionId)}`,
      { credentials: 'include' },
    );
    if (!res.ok) throw new Error(`list failed: ${res.status}`);
    return res.json();
  }
}
