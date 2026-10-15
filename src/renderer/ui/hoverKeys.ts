// Keys that act on the card under the pointer. Shift+L is its own key,
// the library bottom, so it reads as upper case. R is also the restart
// key, so it is only ever offered on its own (see useGameShortcuts).
export type HoverKey =
  't' | 'f' | 'x' | 'g' | 'e' | 'h' | 'b' | 'l' | 'L' | 'c' | 'r';

const plain: ReadonlySet<string> = new Set([
  't',
  'f',
  'x',
  'g',
  'e',
  'h',
  'b',
  'l',
  'c',
]);

// The letter a key means, from its position when the layout isn't Latin,
// so the keys still work with, say, a Cyrillic layout active.
export const letterOf = (e: KeyboardEvent): string => {
  if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase();
  const code = /^Key([A-Z])$/.exec(e.code);
  return code ? code[1].toLowerCase() : e.key.toLowerCase();
};

// Shift with any other letter is kept free for later shortcuts.
export const hoverKeyOf = (e: KeyboardEvent): HoverKey | null => {
  const key = letterOf(e);
  if (!plain.has(key)) return null;
  if (!e.shiftKey) return key as HoverKey;
  return key === 'l' ? 'L' : null;
};

// What a hovered card does with a key; a card without one ignores keys.
// Returning false gives the key back, so it does what it does elsewhere.
export type HoverKeyHandler = (key: HoverKey) => boolean | void;
