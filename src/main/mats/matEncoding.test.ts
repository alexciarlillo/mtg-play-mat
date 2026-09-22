// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  BACK_DISPLAY_WIDTH,
  backDisplayCopy,
  backShareCopy,
  cardShaped,
  decodeMat,
  displayCopy,
  DISPLAY_WIDTH,
  type MatEncoder,
  type MatImage,
  MatError,
  MAX_SHARE_BYTES,
  shareCopy,
} from './matEncoding';

// Stands in for a real picture: its encoded size falls with the width
// and the quality it is asked for, the way a JPEG's does.
const image = (width: number, height: number, bytesPerPixel = 1): MatImage => ({
  isEmpty: () => width === 0,
  getSize: () => ({ width, height }),
  resize: ({ width: next }) =>
    image(next, Math.round((height * next) / width), bytesPerPixel),
  crop: (rect) => image(rect.width, rect.height, bytesPerPixel),
  toJPEG: (quality) =>
    Buffer.alloc(Math.round((width * height * bytesPerPixel * quality) / 100)),
});

const encoder = (from: MatImage): MatEncoder => ({
  createFromBuffer: () => from,
});

// The same picture, but every encode it is asked for is recorded.
const recorded = (from: MatImage) => {
  const calls: { width: number; quality: number }[] = [];
  const wrap = (inner: MatImage): MatImage => ({
    ...inner,
    resize: (options) => wrap(inner.resize(options)),
    crop: (rect) => wrap(inner.crop(rect)),
    toJPEG: (quality) => {
      calls.push({ width: inner.getSize().width, quality });
      return inner.toJPEG(quality);
    },
  });
  return { image: wrap(from), calls };
};

describe('decodeMat', () => {
  it('refuses a file the image decoder could make nothing of', () => {
    expect(() => decodeMat(encoder(image(0, 0)), Buffer.of(1))).toThrow(
      MatError
    );
  });

  it('refuses a picture too small to be a play area', () => {
    expect(() => decodeMat(encoder(image(1, 1)), Buffer.of(1))).toThrow(
      /too small/
    );
  });
});

describe('displayCopy', () => {
  it('caps a huge picture at the display width', () => {
    const resized: number[] = [];
    const big: MatImage = {
      ...image(6000, 3500),
      resize: ({ width }) => {
        resized.push(width);
        return image(width, 3500);
      },
    };
    displayCopy(big);
    expect(resized).toEqual([DISPLAY_WIDTH]);
  });

  it('never enlarges a small one', () => {
    const small: MatImage = {
      ...image(800, 500),
      resize: () => {
        throw new Error('should not resize up');
      },
    };
    expect(() => displayCopy(small)).not.toThrow();
  });
});

describe('shareCopy', () => {
  it('keeps a picture that already fits, at the best step', () => {
    const { image: light, calls } = recorded(image(1600, 900, 0.05));
    const bytes = shareCopy(light);
    expect(bytes.length).toBeLessThanOrEqual(MAX_SHARE_BYTES);
    expect(calls).toEqual([{ width: 1600, quality: 82 }]);
  });

  it('steps a heavy one down until it fits, width before quality', () => {
    const { image: heavy, calls } = recorded(image(4000, 2250, 1));
    const bytes = shareCopy(heavy);
    expect(bytes.length).toBeLessThanOrEqual(MAX_SHARE_BYTES);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls[0]).toEqual({ width: 1600, quality: 82 });
    expect(calls.at(-1)?.width).toBeLessThan(1600);
  });

  it('gives up rather than making a mat that could never be sent', () => {
    // Incompressible at every step: 640 wide still lands over budget.
    expect(() => shareCopy(image(4000, 4000, 100))).toThrow(
      /will not compress/
    );
  });
});

describe('card backs', () => {
  it('takes the middle of the picture, card-shaped', () => {
    const size = (w: number, h: number) => cardShaped(image(w, h)).getSize();
    // Too wide: the sides go. Too tall: the top and bottom go.
    expect(size(1000, 880)).toEqual({ width: 630, height: 880 });
    expect(size(630, 1200)).toEqual({ width: 630, height: 880 });
    // Already card-shaped, it is left alone.
    const exact = image(630, 880);
    expect(cardShaped(exact)).toBe(exact);
  });

  it('keeps a display copy no wider than a large card image', () => {
    const { image: big, calls } = recorded(image(3000, 4190));
    backDisplayCopy(big);
    expect(calls).toEqual([{ width: BACK_DISPLAY_WIDTH, quality: 88 }]);
  });

  it('shares a small copy that fits one message', () => {
    const { image: big, calls } = recorded(image(3000, 4190));
    const bytes = backShareCopy(big);
    expect(bytes.length).toBeLessThanOrEqual(MAX_SHARE_BYTES);
    expect(calls[0]).toEqual({ width: 488, quality: 85 });
  });
});
