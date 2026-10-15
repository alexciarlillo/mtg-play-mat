// A 1x1 grey PNG. Browsers sniff image bytes, so it also stands in where
// a JPEG is expected.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg==',
  'base64'
);

// Stands in for the card image CDN under end-to-end tests, so card images
// still go through the cache but a CDN outage can't fail the suite.
export const placeholderImageFetch = async (): Promise<Response> =>
  new Response(PIXEL, { headers: { 'Content-Type': 'image/png' } });
