import { randomInt } from 'node:crypto';

import {
  actionPlayer,
  type CardRef,
  emptyGame,
  type GameAction,
  type GameState,
  OPENING_HAND_SIZE,
  parsePlayerAction,
  type PlayerAction,
  privateView,
  publicView,
  reduce,
} from '@shared/game';
import { BrowserWindow } from 'electron';

import { type RequestHandlers, sendEvent } from '../../ipc';
import type CardDB from '../../shared/db/CardDB';
import type DeckDB from '../../shared/db/DeckDB';
import { createWindow, whenLoaded } from '../../windows';
import { toCardRef } from './cardRef';
import buildSampleDeck from './sampleDeck';

interface Deps {
  cardDb: CardDB;
  deckDb: DeckDB;
}

type PlayTestHandlers = Pick<
  RequestHandlers,
  | 'startPlayTest'
  | 'restartPlayTest'
  | 'dispatch'
  | 'getBoardView'
  | 'getHandView'
>;

// The one seat this machine is authoritative for.
const LOCAL_PLAYER = 'p1';

// Owns the authoritative game state and the board and hand windows, which
// only render views of it. The windows exist only while a play test is
// open, and closing either one ends the play test by closing both.
export default class PlayTest {
  private readonly cardDb: CardDB;

  private readonly deckDb: DeckDB;

  private board: BrowserWindow | null = null;

  private hand: BrowserWindow | null = null;

  private state: GameState = emptyGame();

  private deck: CardRef[] = [];

  constructor({ cardDb, deckDb }: Deps) {
    this.cardDb = cardDb;
    this.deckDb = deckDb;
  }

  readonly handlers: PlayTestHandlers = {
    startPlayTest: (deckId) => this.start(this.loadDeck(deckId)),
    restartPlayTest: () => this.restart(),
    // Renderer input is untrusted, so parse it rather than trust its type.
    dispatch: (action: unknown) => this.dispatch(parsePlayerAction(action)),
    getBoardView: () => publicView(this.state, LOCAL_PLAYER),
    getHandView: () => privateView(this.state, LOCAL_PLAYER),
  };

  // A fixed seed is only passed by end-to-end tests.
  openSampleDeck = (seed?: number) =>
    this.start(buildSampleDeck(), seed).catch((err) => {
      console.error('[PlayTest] failed to open sample deck', err);
    });

  private loadDeck = (deckId: number): CardRef[] =>
    this.deckDb
      .getDeckCards({ deckId })
      .map((card) => this.cardDb.getCardById({ id: card.card_id }))
      .filter((row) => row !== undefined)
      .map(toCardRef);

  // Windows may only act on the local player's cards; stale actions on
  // cards that no longer exist are dropped the same way.
  private dispatch = (action: PlayerAction) => {
    if (actionPlayer(this.state, action) !== LOCAL_PLAYER) return;
    const next = reduce(this.state, action);
    if (next === this.state) return;
    this.state = next;
    this.pushViews();
  };

  private pushViews = () => {
    const board = publicView(this.state, LOCAL_PLAYER);
    const hand = privateView(this.state, LOCAL_PLAYER);
    if (board) sendEvent(this.board, 'boardView', board);
    if (hand) sendEvent(this.hand, 'handView', hand);
  };

  private newGame = (deck: CardRef[], seed = randomInt(2 ** 32)) => {
    const actions: GameAction[] = [
      {
        type: 'newGame',
        seed,
        players: [{ id: LOCAL_PLAYER, name: 'You', deck }],
      },
      { type: 'shuffle', playerId: LOCAL_PLAYER },
      { type: 'draw', playerId: LOCAL_PLAYER, count: OPENING_HAND_SIZE },
    ];
    this.deck = deck;
    this.state = actions.reduce(reduce, this.state);
  };

  private restart = () => {
    if (!this.board && !this.hand) return;
    this.newGame(this.deck);
    this.pushViews();
  };

  private start = async (deck: CardRef[], seed?: number) => {
    this.newGame(deck, seed);

    const { board, hand } = this.ensureWindows();
    const loaded = await Promise.all([whenLoaded(board), whenLoaded(hand)]);
    if (!loaded.every(Boolean)) return;

    // Windows also fetch their view on load; this covers reused windows.
    this.pushViews();
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
        width: 1280,
        height: 340,
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
