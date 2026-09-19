// The play test's windows as seen by the IPC guards. Sender is generic so
// the rules can be tested without Electron.
export interface PlayTestSenders<S> {
  board: S | null;
  hand: S | null;
  // The hand is docked in the board window; there is no hand window.
  handInBoard: boolean;
}

// The board is usually screenshared, so it may only see hidden cards
// when it also hosts the hand.
const isPrivateBoard = <S>(windows: PlayTestSenders<S>, sender: S) =>
  windows.handInBoard && windows.board !== null && windows.board === sender;

// Only the window that shows the hand may look through the library.
export const mayReadLibrary = <S>(windows: PlayTestSenders<S>, sender: S) =>
  (windows.hand !== null && windows.hand === sender) ||
  isPrivateBoard(windows, sender);

// The hand view is refused to a board that doesn't host the hand. Other
// trusted windows (the app window's deck screens) may still read it.
export const mayReadHand = <S>(windows: PlayTestSenders<S>, sender: S) =>
  windows.board === null ||
  windows.board !== sender ||
  isPrivateBoard(windows, sender);
