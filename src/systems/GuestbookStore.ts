import { LocalStorageGuestbookAdapter } from './guestbook/LocalStorageGuestbookAdapter';
// import { ApiGuestbookAdapter } from './guestbook/ApiGuestbookAdapter';
import type { GuestbookStorage } from './guestbook/types';

export type { GuestbookEntry, GuestbookDraft, GuestbookStorage } from './guestbook/types';

// Swap to ApiGuestbookAdapter when the backend is ready.
export const GuestbookStore: GuestbookStorage = new LocalStorageGuestbookAdapter();
