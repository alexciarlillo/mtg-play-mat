// Short codes people read aloud and paste. Crockford base32 leaves out
// I, L, O and U, and normalization folds the look-alikes back, so a code
// heard over voice chat survives being typed as O for 0 or l for 1.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const LOBBY_CODE_LENGTH = 6;

// Long enough that guessing one inside its short life is hopeless, short
// enough to say in one breath: 32^6 is about a billion.
const GROUP = 3;

const FOLD: Record<string, string> = { I: '1', L: '1', O: '0', U: 'V' };

const randomBytes = (size: number) =>
  crypto.getRandomValues(new Uint8Array(size));

export const generateLobbyCode = (
  random: (size: number) => Uint8Array = randomBytes
): string =>
  // 32 divides 256, so the remainder is unbiased.
  [...random(LOBBY_CODE_LENGTH)]
    .map((byte) => ALPHABET[byte % ALPHABET.length])
    .join('');

// Canonical uppercase code, or null if the input is not one. Spaces,
// dashes and the folded look-alike letters are all accepted.
export const normalizeLobbyCode = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  const stripped = input.replace(/[\s-]+/g, '').toUpperCase();
  if (stripped.length !== LOBBY_CODE_LENGTH) return null;
  const folded = [...stripped].map((char) => FOLD[char] ?? char).join('');
  return [...folded].every((char) => ALPHABET.includes(char)) ? folded : null;
};

export const isLobbyCode = (input: unknown): boolean =>
  normalizeLobbyCode(input) !== null;

// For display only; normalization takes the dash back out.
export const formatLobbyCode = (code: string): string =>
  code.length === LOBBY_CODE_LENGTH
    ? `${code.slice(0, GROUP)}-${code.slice(GROUP)}`
    : code;
