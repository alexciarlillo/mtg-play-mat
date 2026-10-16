import type { DeckBoard } from './types/decks';

// Moxfield usernames are short and plain; anything else is refused
// rather than sent along in a URL.
const USER_NAME = /^[A-Za-z0-9_.-]{1,64}$/;

// Deck ids in Moxfield's links are URL-safe base64.
export const MOXFIELD_PUBLIC_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const isMoxfieldUser = (name: unknown): name is string =>
  typeof name === 'string' && USER_NAME.test(name);

// A bare username, or a link to a profile such as
// https://moxfield.com/users/name; null for anything else.
export const parseMoxfieldUser = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (text.length > 300) return null;
  if (isMoxfieldUser(text)) return text;
  const link = /^(?:https?:\/\/)?(?:www\.)?moxfield\.com\/users\/([^/?#]+)/i;
  const name = link.exec(text)?.[1];
  return name !== undefined && isMoxfieldUser(name) ? name : null;
};

export const sameMoxfieldUser = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();

// Built from the id, never taken from a response, so only Moxfield's own
// site is ever opened.
export const moxfieldDeckUrl = (publicId: string) =>
  `https://moxfield.com/decks/${publicId}`;

export interface MoxfieldDeckInfo {
  publicId: string;
  // Whose public decks it was synced from, and who made it.
  user: string;
  author: string;
  // Moxfield's last-updated time, and when this app last saw it there.
  remoteUpdatedAt: string;
  syncedAt: string;
  // No longer among the user's public decks.
  gone: boolean;
}

export interface UnresolvedSyncCard {
  name: string;
  qty: number;
  board: DeckBoard;
  reason: string;
}

export type DeckSyncOutcome =
  'added' | 'updated' | 'unchanged' | 'gone' | 'failed';

export interface DeckSyncLine {
  publicId: string;
  name: string;
  outcome: DeckSyncOutcome;
  // Why a deck failed.
  error?: string;
  // Cards left out of an added or updated deck.
  unresolved: UnresolvedSyncCard[];
  // Adjustments worth knowing, such as a companion counted once.
  notes: string[];
}

export interface MoxfieldSyncResult {
  user: string;
  finishedAt: string;
  counts: Record<DeckSyncOutcome, number>;
  // False when the list moved while it was read; decks missing from it
  // weren't flagged gone this time.
  complete: boolean;
  decks: DeckSyncLine[];
}

export interface MoxfieldSyncStatus {
  // The username last synced or asked for; blank before the first.
  user: string;
  running: boolean;
  // Decks fetched so far, out of those that need fetching.
  progress: { done: number; total: number } | null;
  lastSyncedAt: string | null;
  // The latest run that finished; a failed run keeps the one before.
  result: MoxfieldSyncResult | null;
  // Why the latest run stopped, if it did; local decks were not changed.
  error: string | null;
}
