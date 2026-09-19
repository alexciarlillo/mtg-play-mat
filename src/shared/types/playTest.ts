// Whether a play test is open, for screens outside the board and hand.
export interface PlayTestStatus {
  open: boolean;
  // The deck of the open game; a null id means the built-in sample deck.
  deck: { id: number | null; name: string } | null;
  // Unpackaged builds can also start the built-in sample deck.
  sampleDeck: boolean;
}
