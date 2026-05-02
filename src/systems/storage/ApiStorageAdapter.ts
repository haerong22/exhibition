import type { CustomMap, CustomMapType, MapStorage } from './types';

// Stub adapter for a future REST API. Fill in the endpoints when the backend is ready.
export class ApiStorageAdapter implements MapStorage {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async list(): Promise<CustomMap[]> {
    const res = await fetch(`${this.baseUrl}/maps`, { credentials: 'include' });
    if (!res.ok) throw new Error(`list failed: ${res.status}`);
    return res.json();
  }

  async listByType(type: CustomMapType): Promise<CustomMap[]> {
    const res = await fetch(`${this.baseUrl}/maps?type=${type}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`listByType failed: ${res.status}`);
    return res.json();
  }

  async get(id: string): Promise<CustomMap | null> {
    const res = await fetch(`${this.baseUrl}/maps/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`get failed: ${res.status}`);
    return res.json();
  }

  async save(map: CustomMap): Promise<CustomMap> {
    const res = await fetch(`${this.baseUrl}/maps/${encodeURIComponent(map.id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(map),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    return res.json();
  }

  async delete(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/maps/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok && res.status !== 404) throw new Error(`delete failed: ${res.status}`);
  }

  newId(): string {
    // Server typically assigns IDs, but a client-side fallback keeps the contract symmetric
    return `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
