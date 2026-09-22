import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LifeCounter from './LifeCounter';
import { FLASH_MS } from './useValueFlash';

const renderCounter = (life: number) =>
  render(<LifeCounter playerId="p1" life={life} onSetLife={vi.fn()} />);

const life = () => screen.getByTestId('life');

afterEach(() => {
  vi.useRealTimers();
});

describe('LifeCounter', () => {
  it('sits white until something happens to it', () => {
    renderCounter(20);
    expect(life()).not.toHaveAttribute('data-flash');
    expect(life().className).toContain('text-white');
  });

  it('turns red on damage and fades back', () => {
    vi.useFakeTimers();
    const { rerender } = renderCounter(20);
    rerender(<LifeCounter playerId="p1" life={17} onSetLife={vi.fn()} />);
    expect(life()).toHaveAttribute('data-flash', 'down');
    expect(life().className).toContain('text-red-500');
    // Quick to colour, slow to come back.
    expect(life().className).toContain('duration-100');

    act(() => vi.advanceTimersByTime(FLASH_MS));
    expect(life().className).toContain('text-white');
    expect(life().className).toContain('duration-1000');
  });

  it('turns green on life gained', () => {
    const { rerender } = renderCounter(20);
    rerender(<LifeCounter playerId="p1" life={25} onSetLife={vi.fn()} />);
    expect(life()).toHaveAttribute('data-flash', 'up');
    expect(life().className).toContain('text-emerald-400');
  });
});
