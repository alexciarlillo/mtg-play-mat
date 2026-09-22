// Turning whatever the player picked into the two copies a mat needs: a
// display copy for their own board, and a share copy small enough to
// reach the rest of the pod in one message.

// Just enough of Electron's NativeImage to encode against, so the sizing
// rules can be tested without a running app.
export interface MatImage {
  isEmpty(): boolean;
  getSize(): { width: number; height: number };
  resize(options: { width: number }): MatImage;
  toJPEG(quality: number): Buffer;
}

export interface MatEncoder {
  createFromBuffer(bytes: Buffer): MatImage;
}

// The mat is drawn about 1100 logical units wide, so twice that covers a
// HiDPI screen with room to spare.
export const DISPLAY_WIDTH = 2048;
export const DISPLAY_QUALITY = 88;

// A net message caps at 256 KB and carries the bytes base64'd (a third
// bigger) inside an envelope, so the share copy gets what is left of
// three quarters of that.
export const MAX_SHARE_BYTES = 180 * 1024;

// Tried in order; the first copy that fits the budget wins. Width goes
// first because a smaller, sharper mat reads better than a wide muddy
// one at the size it is actually drawn.
const SHARE_STEPS: { width: number; quality: number }[] = [
  { width: 1600, quality: 82 },
  { width: 1600, quality: 72 },
  { width: 1280, quality: 72 },
  { width: 1280, quality: 62 },
  { width: 1024, quality: 62 },
  { width: 800, quality: 55 },
  { width: 640, quality: 45 },
];

export class MatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MatError';
  }
}

// Never enlarges: a small picture stays its own size rather than being
// blown up into a blurry one.
const atWidth = (image: MatImage, width: number): MatImage => {
  const size = image.getSize();
  return size.width <= width ? image : image.resize({ width });
};

export const decodeMat = (encoder: MatEncoder, bytes: Buffer): MatImage => {
  const image = encoder.createFromBuffer(bytes);
  if (image.isEmpty()) {
    throw new MatError('That file is not an image this app can read.');
  }
  const { width, height } = image.getSize();
  if (width < 2 || height < 2) throw new MatError('That image is too small.');
  return image;
};

export const displayCopy = (image: MatImage): Buffer =>
  atWidth(image, DISPLAY_WIDTH).toJPEG(DISPLAY_QUALITY);

// The copy that travels. The last step is small enough that a picture
// which still misses the budget there would never have reached the pod,
// so that is worth saying at import rather than at send time.
export const shareCopy = (image: MatImage): Buffer => {
  for (const { width, quality } of SHARE_STEPS) {
    const bytes = atWidth(image, width).toJPEG(quality);
    if (bytes.length <= MAX_SHARE_BYTES) return bytes;
  }
  throw new MatError(
    'That image will not compress small enough to send to the other players.'
  );
};
