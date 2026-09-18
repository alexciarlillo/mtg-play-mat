import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  DeckBoard,
  DeckCardEdit,
  DeckFormat,
  DeckPatch,
  NewDeck,
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
}

export interface DeckCardRow {
  printingId: string;
  qty: number;
  board: DeckBoard;
}

const META_COLUMNS = `d.id, d.name, d.format,
  d.display_printing_id AS displayPrintingId, d.created_at AS createdAt,
  d.updated_at AS updatedAt,
  (SELECT COALESCE(SUM(qty), 0) FROM deck_cards AS c
    WHERE c.deck_id = d.id AND c.board != 'side') AS cardCount`;

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
