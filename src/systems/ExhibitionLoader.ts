import type { ExhibitionConfig } from '../types/exhibition';

export class ExhibitionLoader {
  async load(id: string, configUrl?: string): Promise<ExhibitionConfig> {
    let data: ExhibitionConfig;

    if (configUrl) {
      const res = await fetch(configUrl);
      if (!res.ok) throw new Error(`Failed to fetch config from ${configUrl}`);
      data = await res.json();
    } else {
      const res = await fetch(`/exhibitions/${id}.json`);
      if (!res.ok) throw new Error(`Exhibition "${id}" not found`);
      data = await res.json();
    }

    return this.validate(data);
  }

  async listAvailable(): Promise<{ id: string; name: string; description: string }[]> {
    try {
      const res = await fetch('/exhibitions/index.json');
      if (!res.ok) return [{ id: 'default', name: '기본 전시', description: '샘플 전시' }];
      return await res.json();
    } catch {
      return [{ id: 'default', name: '기본 전시', description: '샘플 전시' }];
    }
  }

  private validate(data: ExhibitionConfig): ExhibitionConfig {
    if (!data.id) data.id = 'custom';
    if (!data.name) data.name = 'Untitled Exhibition';
    if (!data.description) data.description = '';
    if (!data.roomShape) data.roomShape = 'rectangular';
    if (!Array.isArray(data.artworks)) data.artworks = [];

    data.artworks = data.artworks.filter((art) => {
      if (!art.imageUrl || !art.title) return false;
      if (!art.id) art.id = art.title.toLowerCase().replace(/\s+/g, '-');
      if (!art.artist) art.artist = 'Unknown';
      if (!art.width || art.width <= 0) art.width = 1.0;
      if (!art.height || art.height <= 0) art.height = 1.0;
      art.width = Math.min(art.width, 5);
      art.height = Math.min(art.height, 4);
      return true;
    });

    return data;
  }
}
