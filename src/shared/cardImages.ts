// Card images are served by main through a privileged scheme that fills an
// on-disk cache: card://<scryfallId>/<faceIndex>/<size>.

export const CARD_SCHEME = 'card';

export const imageSizes = [
  'small',
  'normal',
  'large',
  'png',
  'art_crop',
  'border_crop',
] as const;

export type ImageSize = (typeof imageSizes)[number];

export interface CardImageRef {
  id: string;
  face: number;
  size: ImageSize;
}

const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Double-faced cards have two faces; meld and some oddities stay below 4.
const MAX_FACES = 4;

export const isScryfallId = (id: string): boolean => idPattern.test(id);

export const cardImageUrl = (
  id: string,
  face = 0,
  size: ImageSize = 'normal'
): string => `${CARD_SCHEME}://${id}/${face}/${size}`;

// Returns null for anything that isn't a well-formed card image URL, so
// the result is safe to turn into a cache path.
export const parseCardImageUrl = (url: string): CardImageRef | null => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${CARD_SCHEME}:`) return null;

  const id = parsed.hostname.toLowerCase();
  const [faceText, size, ...rest] = parsed.pathname.split('/').slice(1);
  const face = Number(faceText);

  if (!isScryfallId(id) || rest.length > 0) return null;
  if (!/^\d$/.test(faceText ?? '') || face >= MAX_FACES) return null;
  if (!imageSizes.includes(size as ImageSize)) return null;

  return { id, face, size: size as ImageSize };
};
