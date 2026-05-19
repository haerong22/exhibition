import type { CustomMap, CustomMapType } from './types';

const FORMAT_VERSION = 1;

interface ExportEnvelope {
  format: 'gallery-map';
  version: number;
  exportedAt: string;
  maps: CustomMap[];
}

// Build a safe filename from the user-provided map name
function slugify(name: string): string {
  const trimmed = name.trim() || 'map';
  // Keep Korean / latin characters; strip filesystem-unfriendly punctuation
  return trimmed.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 60);
}

function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportMap(map: CustomMap): void {
  const envelope: ExportEnvelope = {
    format: 'gallery-map',
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    maps: [map],
  };
  const typeLabel = map.type === 'template' ? 'template' : 'exhibition';
  const filename = `${typeLabel}-${slugify(map.name)}.json`;
  triggerDownload(filename, JSON.stringify(envelope, null, 2));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isObject(v: any): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Validate a single map. Returns the normalized map or null if invalid.
function validateMap(data: unknown): CustomMap | null {
  if (!isObject(data)) return null;
  const { name, gridMap, artworks, textures, type } = data as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim()) return null;
  if (!isObject(gridMap)) return null;
  const gm = gridMap as Record<string, unknown>;
  if (typeof gm.width !== 'number' || typeof gm.height !== 'number' || !Array.isArray(gm.grid)) {
    return null;
  }
  if (!Array.isArray(artworks)) return null;
  if (!isObject(textures)) return null;

  const mapType: CustomMapType = type === 'template' ? 'template' : 'exhibition';
  const obj = data as Record<string, unknown>;
  const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
  const description = optStr(obj.description);
  const artist = optStr(obj.artist);
  const curator = optStr(obj.curator);
  const createdAt = typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString();

  return {
    id: '', // caller assigns
    name: name.trim(),
    type: mapType,
    createdAt,
    updatedAt: new Date().toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gridMap: gridMap as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    textures: textures as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    artworks: artworks as any,
    ...(description ? { description } : {}),
    ...(artist ? { artist } : {}),
    ...(curator ? { curator } : {}),
  };
}

export interface ImportResult {
  maps: CustomMap[];   // validated maps with empty id (caller assigns)
  rejected: number;
}

export async function parseImportFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 형식이 올바르지 않습니다.');
  }

  // Accept three shapes: envelope, single map object, or an array of maps
  let candidates: unknown[];
  if (isObject(data) && (data as Record<string, unknown>).format === 'gallery-map' && Array.isArray((data as Record<string, unknown>).maps)) {
    candidates = (data as Record<string, unknown>).maps as unknown[];
  } else if (Array.isArray(data)) {
    candidates = data;
  } else if (isObject(data)) {
    candidates = [data];
  } else {
    throw new Error('지원하지 않는 파일 형식입니다.');
  }

  const maps: CustomMap[] = [];
  let rejected = 0;
  for (const c of candidates) {
    const v = validateMap(c);
    if (v) maps.push(v);
    else rejected++;
  }
  if (maps.length === 0) {
    throw new Error('파일에서 유효한 맵을 찾을 수 없습니다.');
  }
  return { maps, rejected };
}
