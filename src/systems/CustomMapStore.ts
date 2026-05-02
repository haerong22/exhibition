import { LocalStorageAdapter } from './storage/LocalStorageAdapter';
// import { ApiStorageAdapter } from './storage/ApiStorageAdapter';
import type { MapStorage } from './storage/types';

// Re-export types so existing import paths keep working
export type { CustomMap, CustomMapType, MapStorage } from './storage/types';

// Adapter selection — swap implementation here when migrating to a server backend.
// Example for future API mode:
//   export const CustomMapStore: MapStorage = new ApiStorageAdapter('/api');
export const CustomMapStore: MapStorage = new LocalStorageAdapter();
