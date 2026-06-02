import type { CustomMap, CustomMapType } from './types';
import { GuestbookStore, type GuestbookEntry } from '../GuestbookStore';

const FORMAT_VERSION = 2;

interface ExportEnvelope {
  format: 'gallery-map';
  version: number;
  exportedAt: string;
  maps: CustomMap[];
  // Parallel to maps[]: guestbook entries for that map's `custom-<id>` exhibition.
  // null at index i means "no entries". Older v1 files omit this field entirely.
  guestbook?: (GuestbookEntry[] | null)[];
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

export async function exportMap(map: CustomMap): Promise<void> {
  // Bundle guestbook entries for this exhibition (templates have no guestbook)
  let guestbook: (GuestbookEntry[] | null)[] | undefined;
  if (map.type === 'exhibition') {
    const entries = await GuestbookStore.list(`custom-${map.id}`);
    if (entries.length > 0) guestbook = [entries];
  }
  const envelope: ExportEnvelope = {
    format: 'gallery-map',
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    maps: [map],
    ...(guestbook ? { guestbook } : {}),
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
  // Parallel to maps[]: guestbook entries to restore for that map's `custom-<id>` (null = none)
  guestbook: (GuestbookEntry[] | null)[];
  rejected: number;
}

function validateGuestbookEntries(data: unknown): GuestbookEntry[] | null {
  if (!Array.isArray(data)) return null;
  const out: GuestbookEntry[] = [];
  for (const e of data) {
    if (!isObject(e)) continue;
    const o = e as Record<string, unknown>;
    if (typeof o.message !== 'string' || !o.message.trim()) continue;
    out.push({
      id: typeof o.id === 'string' ? o.id : '',
      exhibitionId: typeof o.exhibitionId === 'string' ? o.exhibitionId : '',
      name: typeof o.name === 'string' ? o.name : '',
      message: o.message,
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
    });
  }
  return out.length > 0 ? out : null;
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
  let guestbookSource: unknown[] | undefined;
  if (isObject(data) && (data as Record<string, unknown>).format === 'gallery-map' && Array.isArray((data as Record<string, unknown>).maps)) {
    candidates = (data as Record<string, unknown>).maps as unknown[];
    const gb = (data as Record<string, unknown>).guestbook;
    if (Array.isArray(gb)) guestbookSource = gb;
  } else if (Array.isArray(data)) {
    candidates = data;
  } else if (isObject(data)) {
    candidates = [data];
  } else {
    throw new Error('지원하지 않는 파일 형식입니다.');
  }

  const maps: CustomMap[] = [];
  const guestbook: (GuestbookEntry[] | null)[] = [];
  let rejected = 0;
  for (let i = 0; i < candidates.length; i++) {
    const v = validateMap(candidates[i]);
    if (v) {
      maps.push(v);
      const entries = guestbookSource ? validateGuestbookEntries(guestbookSource[i]) : null;
      guestbook.push(entries);
    } else {
      rejected++;
    }
  }
  if (maps.length === 0) {
    throw new Error('파일에서 유효한 맵을 찾을 수 없습니다.');
  }
  return { maps, guestbook, rejected };
}
