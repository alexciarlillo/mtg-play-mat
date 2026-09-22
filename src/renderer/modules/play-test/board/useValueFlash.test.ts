import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import useValueFlash, { FLASH_MS } from './useValueFlash';

afterEach(() => {
  vi.useRealTimers();
});

describe('useValueFlash', () => {
  it('says nothing about the value it started on', () => {
    const { result } = renderHook(() => useValueFlash(20));
    expect(result.current).toBeNull();
  });

  it('marks a fall, then clears it', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ life }) => useValueFlash(life), {
      initialProps: { life: 20 },
    });
    rerender({ life: 17 });
    expect(result.current).toBe('down');
    act(() => vi.advanceTimersByTime(FLASH_MS));
    expect(result.current).toBeNull();
  });

  it('marks a rise', () => {
    const { result, rerender } = renderHook(({ life }) => useValueFlash(life), {
      initialProps: { life: 20 },
    });
    rerender({ life: 24 });
    expect(result.current).toBe('up');
  });

  it('starts the second flash over rather than clearing on the first timer', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ life }) => useValueFlash(life), {
      initialProps: { life: 20 },
    });
    rerender({ life: 19 });
    act(() => vi.advanceTimersByTime(FLASH_MS - 100));
    rerender({ life: 18 });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('down');
    act(() => vi.advanceTimersByTime(FLASH_MS));
    expect(result.current).toBeNull();
  });

  it('stays quiet when a player has no view to compare against', () => {
    const { result, rerender } = renderHook(
      ({ life }: { life: number | null }) => useValueFlash(life),
      { initialProps: { life: null as number | null } }
    );
    rerender({ life: 40 });
    expect(result.current).toBeNull();
    rerender({ life: 40 });
    expect(result.current).toBeNull();
  });
});
