import {
  type DeckSyncLine,
  type DeckSyncOutcome,
  moxfieldDeckUrl,
  MOXFIELD_PUBLIC_ID,
  type MoxfieldSyncStatus,
  parseMoxfieldUser,
} from '@shared/moxfield';

import type { RequestHandlers } from '../../ipc';
import { MoxfieldError } from '../../moxfield/moxfieldApi';
import type { MoxfieldClient } from '../../moxfield/moxfieldClient';
import { planSync, toDeckWrite } from '../../moxfield/syncMoxfield';
import type CardDB from '../../shared/db/CardDB';
import type DeckDB from '../../shared/db/DeckDB';
import { getErrorMessage } from '../../util';
import type SettingsStore from '../settings/SettingsStore';

export type MoxfieldHandlers = Pick<
  RequestHandlers,
  'getMoxfieldSync' | 'syncMoxfield' | 'cancelMoxfieldSync' | 'openMoxfieldDeck'
>;

interface Deps {
  client: MoxfieldClient;
  cardDb: CardDB;
  deckDb: DeckDB;
  settings: SettingsStore;
  onStatus(status: MoxfieldSyncStatus): void;
  // A synced deck's cards changed, so anything kept for the old list,
  // such as a saved game, no longer fits it.
  cardsChanged?(deckId: number): void;
  openExternal(url: string): Promise<void>;
  // Between requests; kept short in tests.
  pauseMs?: number;
  now?(): string;
}

const cancelled = () =>
  new MoxfieldError('cancelled', 'The sync was cancelled.');

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(cancelled());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(cancelled());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

const countOf = (lines: DeckSyncLine[]) => {
  const counts: Record<DeckSyncOutcome, number> = {
    added: 0,
    updated: 0,
    unchanged: 0,
    gone: 0,
    failed: 0,
  };
  lines.forEach((line) => {
    counts[line.outcome] += 1;
  });
  return counts;
};

// Syncs one user's public Moxfield decks into the deck database. One run
// at a time; nothing is written until every needed deck has arrived.
export default class MoxfieldSync {
  private current: MoxfieldSyncStatus;

  private controller: AbortController | null = null;

  constructor(private readonly deps: Deps) {
    const user = deps.settings.settings.moxfieldUser;
    this.current = {
      user,
      running: false,
      progress: null,
      lastSyncedAt: user ? deps.deckDb.lastSyncedAt(user) : null,
      result: null,
      error: null,
    };
  }

  get status(): MoxfieldSyncStatus {
    return this.current;
  }

  private set = (patch: Partial<MoxfieldSyncStatus>) => {
    this.current = { ...this.current, ...patch };
    this.deps.onStatus(this.current);
  };

  // Resolves when the run ends; the handler doesn't wait for it.
  sync = (input: unknown): Promise<void> | null => {
    if (this.controller) return null;
    const user = parseMoxfieldUser(input);
    if (!user) {
      this.set({
        error: 'Enter a Moxfield username, or a link to a Moxfield profile.',
      });
      return null;
    }
    this.deps.settings.update({ moxfieldUser: user });
    const controller = new AbortController();
    this.controller = controller;
    const sameUser = this.current.user.toLowerCase() === user.toLowerCase();
    this.set({
      user,
      running: true,
      progress: null,
      error: null,
      ...(!sameUser && {
        result: null,
        lastSyncedAt: this.deps.deckDb.lastSyncedAt(user),
      }),
    });
    return this.run(user, controller.signal).finally(() => {
      this.controller = null;
    });
  };

  cancel = () => {
    this.controller?.abort();
  };

  private run = async (user: string, signal: AbortSignal) => {
    const { client, cardDb, deckDb, pauseMs = 400 } = this.deps;
    try {
      // Every card would come out unresolved.
      if (!cardDb.available) {
        throw new MoxfieldError(
          'schema',
          'Card data is not ready yet. Sync once it has downloaded.'
        );
      }
      const plan = await planSync({
        client,
        user,
        local: deckDb.moxfieldDecks(user),
        knownIds: deckDb.moxfieldIds(),
        signal,
        pause: (s) => wait(pauseMs, s),
        onProgress: (done, total) => this.set({ progress: { done, total } }),
      });
      if (signal.aborted) throw cancelled();
      if (!cardDb.available) {
        throw new MoxfieldError(
          'schema',
          'Card data changed during the sync. Try again.'
        );
      }

      const lookups = {
        byId: cardDb.summariesByIds,
        byName: cardDb.candidatesByName,
      };
      const lines: DeckSyncLine[] = [];
      const writes = plan.fetched.map(({ deck, isNew }) => {
        const { write, unresolved, notes } = toDeckWrite(deck, lookups);
        lines.push({
          publicId: deck.publicId,
          name: write.name,
          outcome: isNew ? 'added' : 'updated',
          unresolved,
          notes,
        });
        return write;
      });
      plan.unchanged.forEach((ref) =>
        lines.push({
          publicId: ref.publicId,
          name: ref.name,
          outcome: 'unchanged',
          unresolved: [],
          notes: [],
        })
      );
      plan.gone.forEach((deck) =>
        lines.push({
          publicId: deck.publicId,
          name: deck.name,
          outcome: 'gone',
          unresolved: [],
          notes: [],
        })
      );
      plan.failed.forEach(({ ref, error }) =>
        lines.push({
          publicId: ref.publicId,
          name: ref.name,
          outcome: 'failed',
          error,
          unresolved: [],
          notes: [],
        })
      );

      const syncedAt = this.deps.now?.() ?? new Date().toISOString();
      const applied = deckDb.applyMoxfieldSync({
        user,
        syncedAt,
        decks: writes,
        unchanged: plan.unchanged.map((ref) => ref.publicId),
        gone: plan.gone.map((deck) => deck.publicId),
      });
      applied.cardsChanged.forEach((id) => this.deps.cardsChanged?.(id));

      this.set({
        running: false,
        progress: null,
        lastSyncedAt: syncedAt,
        result: {
          user,
          finishedAt: syncedAt,
          counts: countOf(lines),
          complete: plan.complete,
          decks: lines,
        },
        error: null,
      });
    } catch (err) {
      if (!(err instanceof MoxfieldError)) {
        console.warn('[moxfield] sync failed', getErrorMessage(err));
      }
      this.set({
        running: false,
        progress: null,
        error:
          err instanceof MoxfieldError
            ? err.message
            : `The sync failed: ${getErrorMessage(err)}`,
      });
    }
  };

  get handlers(): MoxfieldHandlers {
    return {
      getMoxfieldSync: () => this.current,
      syncMoxfield: (input) => {
        void this.sync(input);
        return this.current;
      },
      cancelMoxfieldSync: () => {
        this.cancel();
      },
      openMoxfieldDeck: async (deckId) => {
        if (!Number.isSafeInteger(deckId)) return;
        const deck = this.deps.deckDb.getDeck(deckId);
        const publicId = deck?.moxfieldId;
        if (publicId && MOXFIELD_PUBLIC_ID.test(publicId)) {
          await this.deps.openExternal(moxfieldDeckUrl(publicId));
        }
      },
    };
  }
}
