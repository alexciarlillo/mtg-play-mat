// Whether a play test is open, for screens outside the board and hand.
export interface PlayTestStatus {
  open: boolean;
  // The deck of the open game; a null id means the built-in sample deck.
  deck: { id: number | null; name: string } | null;
  // Unpackaged builds can also start the built-in sample deck.
  sampleDeck: boolean;
  // The open game's board window also hosts the hand.
  handInBoard: boolean;
}

// What the board offers when a play test opens on a deck with a saved
// game, or tells the player when that save couldn't be used.
export type SavedGameOffer =
  | {
      kind: 'restore';
      deckName: string;
      savedAt: number;
      // Why the last try was refused, e.g. a permanent is lent out.
      refused?: string;
    }
  | { kind: 'failed'; message: string };

// Game menu items the board window carries out, mostly by opening one of
// its dialogs; the rest of the Game menu acts in main directly.
export type BoardMenuCommand =
  | 'drawMany'
  | 'mill'
  | 'exileTop'
  | 'bulkMove'
  | 'token'
  | 'restart'
  | 'help'
  | 'addDummy';

// Private dialogs the board may ask the hand to open, wherever it is.
export const handCommands = [
  'viewBottom',
  'search',
  'look',
  'revealUntil',
] as const;
export type HandCommand = (typeof handCommands)[number];

export const isHandCommand = (value: unknown): value is HandCommand =>
  handCommands.includes(value as HandCommand);

// App window pages main may ask it to show.
export type AppRoute = 'settings';
