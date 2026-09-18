import CardModel from '@shared/models/CardModel';
import { BrowserWindow } from 'electron';

import { type RequestHandlers, sendEvent } from '../../ipc';
import type CardDB from '../../shared/db/CardDB';
import type DeckDB from '../../shared/db/DeckDB';
import { createWindow, whenLoaded } from '../../windows';
import buildSampleDeck from './sampleDeck';

interface Deps {
  cardDb: CardDB;
  deckDb: DeckDB;
}

type PlayTestHandlers = Pick<
  RequestHandlers,
  'startPlayTest' | 'drawCard' | 'playCard'
>;

// Owns the board and hand windows. They exist only while a play test is
// open, and closing either one ends the play test by closing both.
export default class PlayTest {
  private readonly cardDb: CardDB;

  private readonly deckDb: DeckDB;

  private board: BrowserWindow | null = null;

  private hand: BrowserWindow | null = null;

  constructor({ cardDb, deckDb }: Deps) {
    this.cardDb = cardDb;
    this.deckDb = deckDb;
  }

  readonly handlers: PlayTestHandlers = {
    startPlayTest: (deckId) => this.start(this.loadDeck(deckId)),
    drawCard: (card) => sendEvent(this.hand, 'cardDrawn', card),
    playCard: (card) => sendEvent(this.board, 'cardPlayed', card),
  };

  openSampleDeck = () =>
    this.start(buildSampleDeck()).catch((err) => {
      console.error('[PlayTest] failed to open sample deck', err);
    });

  private loadDeck = (deckId: number): CardModel[] =>
    this.deckDb
      .getDeckCards({ deckId })
      .map((card, index) => {
        const row = this.cardDb.getCardById({ id: card.card_id });
        if (!row) return null;

        return new CardModel({
          ...row,
          keywords:
            row.keywords?.split(',').map((keyword) => keyword.toLowerCase()) ??
            [],
          id: row.uuid,
          key: index,
        });
      })
      .filter((card): card is CardModel => card !== null);

  private start = async (cards: CardModel[]) => {
    const { board, hand } = this.ensureWindows();
    const loaded = await Promise.all([whenLoaded(board), whenLoaded(hand)]);
    if (!loaded.every(Boolean)) return;

    sendEvent(board, 'deckLoaded', cards);
    sendEvent(hand, 'deckLoaded', cards);
    hand.show();
    board.show();
    board.focus();
  };

  private ensureWindows = () => {
    const board =
      this.board ??
      createWindow({
        html: 'board.html',
        width: 1560,
        height: 728,
      });

    const hand =
      this.hand ??
      createWindow({
        html: 'hand.html',
        width: 1200,
        height: 330,
        frame: false,
      });

    if (!this.board) {
      this.board = board;
      board.on('closed', () => {
        this.board = null;
        this.hand?.close();
      });
    }

    if (!this.hand) {
      this.hand = hand;
      hand.on('closed', () => {
        this.hand = null;
        this.board?.close();
      });
    }

    return { board, hand };
  };
}
