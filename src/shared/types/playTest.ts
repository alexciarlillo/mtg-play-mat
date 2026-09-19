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

// Game menu items the board window carries out, mostly by opening one of
// its dialogs; the rest of the Game menu acts in main directly.
export type BoardMenuCommand =
  'drawMany' | 'mill' | 'token' | 'restart' | 'help' | 'addDummy';

// App window pages main may ask it to show.
export type AppRoute = 'settings';
