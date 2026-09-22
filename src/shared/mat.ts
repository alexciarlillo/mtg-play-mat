// A play area background: the player's own image, shown under their
// battlefield and sent to the rest of the pod. Mats are addressed by the
// hash of their bytes, so the same picture is never stored or sent twice
// and a peer's mat can be cached across sessions.

export const MAT_SCHEME = 'mat';

// Hex sha-256, as the store names its files.
export const MAT_ID_LENGTH = 64;

const MAT_ID = /^[0-9a-f]{64}$/;

export const isMatId = (value: unknown): value is string =>
  typeof value === 'string' && MAT_ID.test(value);

export const matImageUrl = (id: string): string => `${MAT_SCHEME}://${id}`;

// Null for anything that is not a well-formed mat URL, so the result is
// safe to turn into a path.
export const parseMatImageUrl = (url: string): string | null => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${MAT_SCHEME}:`) return null;
  const id = parsed.hostname.toLowerCase();
  const rest = parsed.pathname.replace(/^\/+/, '');
  return isMatId(id) && rest === '' ? id : null;
};

// Everything a mat needs to be drawn, and to travel. A mat is stored as
// JPEG: play area art has no use for transparency, and the share copy
// has to fit in one net message.
export const MAT_CONTENT_TYPE = 'image/jpeg';

// What choosing a mat comes back with: the new mat's id, nothing if the
// player closed the dialog, or something to show them if the file could
// not be used.
export interface MatChoice {
  id: string | null;
  error: string | null;
}

// The picture formats worth offering. JPEG costs nothing to accept and
// is what half the art on a hard disk already is.
export const MAT_FILE_EXTENSIONS = ['png', 'jpg', 'jpeg'];
