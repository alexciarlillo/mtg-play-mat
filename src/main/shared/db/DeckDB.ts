import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  DeckBoard,
  DeckCardEdit,
  DeckFormat,
  DeckPatch,
  NewDeck,
  NewDeckCard,
} from '@shared/types/decks';

import { getErrorMessage } from '../../util';
import { deckMigrations } from './deckSchema';
import { migrate, transaction } from './migrate';

export interface DeckMetaRow {
  id: number;
  name: string;
  format: DeckFormat;
  displayPrintingId: string | null;
  createdAt: string;
  updatedAt: string;
  cardCount: number;
  source: 'local' | 'moxfield';
  moxfieldId: string | null;
  moxfieldUser: string | null;
  moxfieldAuthor: string | null;
  moxfieldUpdatedAt: string | null;
  syncedAt: string | null;
  moxfieldGone: number;
}

// A synced deck as a re-sync compares it.
export interface LocalMoxfieldDeck {
  id: number;
  name: string;
  publicId: string;
  remoteUpdatedAt: string;
}

// One deck's new contents from Moxfield.
export interface MoxfieldDeckWrite {
  publicId: string;
  name: string;
  format: DeckFormat;
  author: string;
  remoteUpdatedAt: string;
  displayPrintingId: string | null;
  cards: NewDeckCard[];
}

export interface MoxfieldSyncWrite {
  user: string;
  syncedAt: string;
  // New or changed upstream.
  decks: MoxfieldDeckWrite[];
  // Seen upstream with nothing new.
  unchanged: string[];
  // No longer among the user's public decks.
  gone: string[];
}

export interface MoxfieldSyncApplied {
  ids: Map<string, number>;
  // Existing decks whose cards are now different.
  cardsChanged: number[];
}

export interface DeckCardRow {
  printingId: string;
  qty: number;
  board: DeckBoard;
}

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ')`;

const cardKey = (c: { printingId: string; qty: number; board: string }) =>
  `${c.board}:${c.printingId}:${c.qty}`;

const META_COLUMNS = `d.id, d.name, d.format,
  d.display_printing_id AS displayPrintingId, d.created_at AS createdAt,
  d.updated_at AS updatedAt, d.source, d.moxfield_id AS moxfieldId,
  d.moxfield_user AS moxfieldUser, d.moxfield_author AS moxfieldAuthor,
  d.moxfield_updated_at AS moxfieldUpdatedAt, d.synced_at AS syncedAt,
  d.moxfield_gone AS moxfieldGone,
  (SELECT COALESCE(SUM(qty), 0) FROM deck_cards AS c
    WHERE c.deck_id = d.id AND c.board IN ('main', 'commander')) AS cardCount`;

export const MAX_QTY = 999;

export default class DeckDB {
  // Null when the file can't be opened; callers treat that as no decks.
  private db: DatabaseSync | null = null;

  constructor(readonly filePath: string) {
    try {
      if (filePath !== ':memory:') {
        mkdirSync(path.dirname(filePath), { recursive: true });
      }
      const db = new DatabaseSync(filePath);
      db.exec('PRAGMA foreign_keys = ON');
      migrate(db, deckMigrations);
      this.db = db;
    } catch (err) {
      console.warn('[DeckDB] failed to open', {
        message: getErrorMessage(err),
        filePath,
      });
    }
  }

  close = () => {
    this.db?.close();
    this.db = null;
  };

  listDecks = (): DeckMetaRow[] => {
    if (!this.db) return [];
    return this.db
      .prepare(
        `SELECT ${META_COLUMNS} FROM decks AS d
         ORDER BY d.updated_at DESC, d.id DESC`
      )
      .all() as unknown as DeckMetaRow[];
  };

  getDeck = (id: number): DeckMetaRow | undefined => {
    if (!this.db) return undefined;
    return this.db
      .prepare(`SELECT ${META_COLUMNS} FROM decks AS d WHERE d.id = ?`)
      .get(id) as DeckMetaRow | undefined;
  };

  getDeckCards = (deckId: number): DeckCardRow[] => {
    if (!this.db) return [];
    return this.db
      .prepare(
        `SELECT printing_id AS printingId, qty, board FROM deck_cards
         WHERE deck_id = ? ORDER BY rowid`
      )
      .all(deckId) as unknown as DeckCardRow[];
  };

  // Duplicate printing/board pairs are merged by adding their quantities.
  createDeck = ({ name, format, cards, displayPrintingId }: NewDeck) => {
    const { db } = this;
    if (!db) throw new Error('no deck database');

    return transaction(db, () => {
      const info = db
        .prepare(
          `INSERT INTO decks (name, format, display_printing_id)
           VALUES (?, ?, ?)`
        )
        .run(name, format, displayPrintingId ?? cards[0]?.printingId ?? null);
      const deckId = Number(info.lastInsertRowid);
      const add = db.prepare(
        `INSERT INTO deck_cards (deck_id, printing_id, qty, board)
         VALUES (?, ?, ?, ?)
         ON CONFLICT DO UPDATE SET qty = MIN(qty + excluded.qty, ${MAX_QTY})`
      );
      cards.forEach((card) => {
        add.run(deckId, card.printingId, card.qty, card.board);
      });
      return deckId;
    });
  };

  updateDeck = (id: number, patch: DeckPatch) => {
    const { db } = this;
    if (!db) return;
    transaction(db, () => {
      if (patch.name !== undefined) {
        db.prepare('UPDATE decks SET name = ? WHERE id = ?').run(
          patch.name,
          id
        );
      }
      if (patch.format !== undefined) {
        db.prepare('UPDATE decks SET format = ? WHERE id = ?').run(
          patch.format,
          id
        );
      }
      if (patch.displayPrintingId !== undefined) {
        db.prepare('UPDATE decks SET display_printing_id = ? WHERE id = ?').run(
          patch.displayPrintingId,
          id
        );
      }
      this.touch(id);
    });
  };

  editCards = (id: number, edit: DeckCardEdit) => {
    const { db } = this;
    if (!db) return;

    const qtyOf = (printingId: string, board: DeckBoard) =>
      (
        db
          .prepare(
            `SELECT qty FROM deck_cards
             WHERE deck_id = ? AND printing_id = ? AND board = ?`
          )
          .get(id, printingId, board) as { qty: number } | undefined
      )?.qty ?? 0;

    const setQty = (printingId: string, board: DeckBoard, qty: number) => {
      if (qty <= 0) {
        db.prepare(
          `DELETE FROM deck_cards
           WHERE deck_id = ? AND printing_id = ? AND board = ?`
        ).run(id, printingId, board);
        return;
      }
      db.prepare(
        `INSERT INTO deck_cards (deck_id, printing_id, qty, board)
         VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET qty = excluded.qty`
      ).run(id, printingId, Math.min(qty, MAX_QTY), board);
    };

    // Moves all copies from one row to another, merging into any copies
    // already there.
    const transfer = (
      from: { printingId: string; board: DeckBoard },
      to: { printingId: string; board: DeckBoard }
    ) => {
      const qty = qtyOf(from.printingId, from.board);
      if (qty === 0) return;
      setQty(from.printingId, from.board, 0);
      setQty(to.printingId, to.board, qtyOf(to.printingId, to.board) + qty);
    };

    transaction(db, () => {
      if (!this.getDeck(id)) return;
      switch (edit.type) {
        case 'setQty':
          setQty(edit.printingId, edit.board, edit.qty);
          break;
        case 'add':
          setQty(
            edit.printingId,
            edit.board,
            qtyOf(edit.printingId, edit.board) + edit.qty
          );
          break;
        case 'move':
          transfer(
            { printingId: edit.printingId, board: edit.from },
            { printingId: edit.printingId, board: edit.to }
          );
          break;
        case 'setPrinting': {
          transfer(
            { printingId: edit.printingId, board: edit.board },
            { printingId: edit.newPrintingId, board: edit.board }
          );
          // The cover follows its card to the new printing.
          db.prepare(
            `UPDATE decks SET display_printing_id = ?
             WHERE id = ? AND display_printing_id = ?`
          ).run(edit.newPrintingId, id, edit.printingId);
          break;
        }
        default:
          break;
      }
      this.touch(id);
    });
  };

  // A plain local deck with the same cards, cover and format.
  copyDeck = (id: number, name: string): number | undefined => {
    const meta = this.getDeck(id);
    if (!meta) return undefined;
    return this.createDeck({
      name,
      format: meta.format,
      displayPrintingId: meta.displayPrintingId,
      cards: this.getDeckCards(id),
    });
  };

  // Synced decks from one user's list, matched ignoring case as Moxfield
  // does.
  moxfieldDecks = (user: string): LocalMoxfieldDeck[] => {
    if (!this.db) return [];
    return this.db
      .prepare(
        `SELECT id, name, moxfield_id AS publicId,
           moxfield_updated_at AS remoteUpdatedAt
         FROM decks WHERE source = 'moxfield'
           AND lower(moxfield_user) = lower(?)`
      )
      .all(user) as unknown as LocalMoxfieldDeck[];
  };

  // Kept apart from the decks, so a user with none still has a time.
  lastSyncedAt = (user: string): string | null => {
    if (!this.db) return null;
    const row = this.db
      .prepare('SELECT synced_at AS at FROM moxfield_syncs WHERE user = ?')
      .get(user) as { at: string } | undefined;
    return row?.at ?? null;
  };

  // Every synced deck's Moxfield id, from any user's list.
  moxfieldIds = (): Set<string> => {
    if (!this.db) return new Set();
    const rows = this.db
      .prepare(
        `SELECT moxfield_id AS id FROM decks WHERE moxfield_id IS NOT NULL`
      )
      .all() as { id: string }[];
    return new Set(rows.map((r) => r.id));
  };

  // Everything one sync changes, all at once or not at all. A deck is
  // matched by its Moxfield id, so it keeps its own id across re-syncs.
  applyMoxfieldSync = (sync: MoxfieldSyncWrite): MoxfieldSyncApplied => {
    const { db } = this;
    if (!db) throw new Error('no deck database');

    const idOf = (publicId: string) =>
      (
        db
          .prepare('SELECT id FROM decks WHERE moxfield_id = ?')
          .get(publicId) as { id: number } | undefined
      )?.id;
    const addCards = db.prepare(
      `INSERT INTO deck_cards (deck_id, printing_id, qty, board)
       VALUES (?, ?, ?, ?)
       ON CONFLICT DO UPDATE SET qty = MIN(qty + excluded.qty, ${MAX_QTY})`
    );

    return transaction(db, () => {
      const ids = new Map<string, number>();
      const cardsChanged: number[] = [];

      sync.decks.forEach((deck) => {
        const existing = idOf(deck.publicId);
        const before = existing
          ? this.getDeckCards(existing).map(cardKey).sort().join('|')
          : null;
        const meta = [
          deck.name,
          deck.format,
          deck.displayPrintingId,
          sync.user,
          deck.author,
          deck.remoteUpdatedAt,
          sync.syncedAt,
        ];
        let id: number;
        if (existing) {
          db.prepare(
            `UPDATE decks SET name = ?, format = ?, display_printing_id = ?,
               moxfield_user = ?, moxfield_author = ?,
               moxfield_updated_at = ?, synced_at = ?, moxfield_gone = 0,
               updated_at = ${NOW}
             WHERE id = ?`
          ).run(...meta, existing);
          db.prepare('DELETE FROM deck_cards WHERE deck_id = ?').run(existing);
          id = existing;
        } else {
          const info = db
            .prepare(
              `INSERT INTO decks (name, format, display_printing_id,
                 moxfield_user, moxfield_author, moxfield_updated_at,
                 synced_at, source, moxfield_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'moxfield', ?)`
            )
            .run(...meta, deck.publicId);
          id = Number(info.lastInsertRowid);
        }
        deck.cards.forEach((card) => {
          addCards.run(id, card.printingId, card.qty, card.board);
        });
        ids.set(deck.publicId, id);
        if (
          existing &&
          before !== this.getDeckCards(existing).map(cardKey).sort().join('|')
        ) {
          cardsChanged.push(existing);
        }
      });

      const seen = db.prepare(
        `UPDATE decks SET synced_at = ?, moxfield_user = ?, moxfield_gone = 0
         WHERE moxfield_id = ?`
      );
      sync.unchanged.forEach((publicId) => {
        seen.run(sync.syncedAt, sync.user, publicId);
      });
      const gone = db.prepare(
        'UPDATE decks SET moxfield_gone = 1 WHERE moxfield_id = ?'
      );
      sync.gone.forEach((publicId) => {
        gone.run(publicId);
      });
      db.prepare(
        `INSERT INTO moxfield_syncs (user, synced_at) VALUES (?, ?)
         ON CONFLICT DO UPDATE SET user = excluded.user,
           synced_at = excluded.synced_at`
      ).run(sync.user, sync.syncedAt);

      return { ids, cardsChanged };
    });
  };

  deleteDeck = (id: number) => {
    this.db?.prepare('DELETE FROM decks WHERE id = ?').run(id);
  };

  private touch = (id: number) => {
    this.db
      ?.prepare(
        `UPDATE decks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ')
         WHERE id = ?`
      )
      .run(id);
  };
}
