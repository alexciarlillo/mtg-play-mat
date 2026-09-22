// Invite and reply codes: a session description packed as JSON {t, s},
// deflated when the runtime can, then base64url so it survives chat apps
// and URLs. MPM1 = deflate-raw, MPM0 = plain; the prefix says which.

export interface SessionDescription {
  type: 'offer' | 'answer';
  sdp: string;
}

export class CodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodeError';
  }
}

export const DEEP_LINK_SCHEME = 'mtgplaymat';

// Real codes are a few hundred bytes; this only stops absurd pastes.
const MAX_CODE_LENGTH = 64 * 1024;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const fromBase64Url = (text: string): Uint8Array => {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const pipeBytes = async (
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream
): Promise<Uint8Array> => {
  const stream = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

export const packDescription = async (
  desc: SessionDescription
): Promise<string> => {
  const json = JSON.stringify({ t: desc.type, s: desc.sdp });
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'function') {
    try {
      const deflated = await pipeBytes(
        bytes,
        new CompressionStream('deflate-raw')
      );
      return `MPM1:${toBase64Url(deflated)}`;
    } catch {
      // Fall through to the uncompressed form.
    }
  }
  return `MPM0:${toBase64Url(bytes)}`;
};

// Accepts a bare code or a full mtgplaymat://join?c=… link, since people
// paste whichever they were sent.
export const extractCode = (input: string): string => {
  const trimmed = input.trim();
  if (trimmed.toLowerCase().startsWith(`${DEEP_LINK_SCHEME}:`)) {
    return parseJoinLink(trimmed) ?? '';
  }
  return trimmed.replace(/\s+/g, '');
};

export const unpackDescription = async (
  input: string
): Promise<SessionDescription> => {
  const code = extractCode(input);
  if (!code) throw new CodeError('Paste the code from your opponent first.');
  if (code.length > MAX_CODE_LENGTH) {
    throw new CodeError('That code is far too long to be a real code.');
  }

  const match = /^MPM([01]):([A-Za-z0-9_-]+)$/.exec(code);
  if (!match) {
    throw new CodeError(
      'That is not an MTG Play Mat code. It should start with MPM1: or ' +
        'MPM0:. Check that you copied the whole thing.'
    );
  }

  let parsed: unknown;
  try {
    const bytes = fromBase64Url(match[2]);
    const raw =
      match[1] === '1'
        ? await pipeBytes(bytes, new DecompressionStream('deflate-raw'))
        : bytes;
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new CodeError(
      'That code is damaged or cut off. Ask for it again and copy all of it.'
    );
  }

  const fields = parsed as { t?: unknown; s?: unknown } | null;
  if (
    !fields ||
    (fields.t !== 'offer' && fields.t !== 'answer') ||
    typeof fields.s !== 'string' ||
    fields.s.length === 0
  ) {
    throw new CodeError('That code is incomplete. Ask for it again.');
  }
  return { type: fields.t, sdp: fields.s };
};

export const joinLink = (code: string): string =>
  `${DEEP_LINK_SCHEME}://join?c=${code}`;

export const lobbyLink = (code: string): string =>
  `${DEEP_LINK_SCHEME}://join?l=${code}`;

const linkParam = (link: string, key: 'c' | 'l'): string | null => {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== `${DEEP_LINK_SCHEME}:`) return null;
  // Custom schemes put "join" in the host or the path depending on parser.
  const target = (url.host || url.pathname).replace(/^\/+|\/+$/g, '');
  if (target !== 'join') return null;
  const value = url.searchParams.get(key)?.trim();
  return value ? value : null;
};

// The lobby code in a mtgplaymat://join?l=… link, or null for any other
// link.
export const parseLobbyLink = (link: string): string | null =>
  linkParam(link, 'l');

// The invite code in a mtgplaymat://join?c=… link, or null for any other
// link.
export const parseJoinLink = (link: string): string | null =>
  linkParam(link, 'c');

export const findJoinLink = (argv: readonly string[]): string | null =>
  argv.find(
    (arg) => parseJoinLink(arg) !== null || parseLobbyLink(arg) !== null
  ) ?? null;
