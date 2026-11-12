import type { CardView } from '@shared/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { zoneCardMenu } from './zoneMenus';

const card = (patch: Partial<CardView> = {}): CardView => ({
  instanceId: 'p1:7',
  ref: null,
  owner: 'p1',
  controller: 'p1',
  zone: 'exile',
  position: null,
  tapped: false,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
  ...patch,
});

const dispatch = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.assign(window, { api: { dispatch } });
});

afterEach(() => dispatch.mockClear());

const pick = (c: CardView, title: string, onCounter = vi.fn()) => {
  const item = zoneCardMenu(c, onCounter).find((i) => i.title === title);
  expect(item).toBeDefined();
  item!.action!();
  return onCounter;
};

describe('zoneCardMenu', () => {
  it('opens the counter dialog for an exiled card', () => {
    const onCounter = pick(card(), 'Add counter…');
    expect(onCounter).toHaveBeenCalledWith(card(), false);
  });

  it('steps counters already on an exiled card', () => {
    pick(card({ counters: { croak: 1 } }), 'Remove croak counter');
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'adjustCounter',
        counter: 'croak',
        delta: -1,
      })
    );
  });

  it('exiles a graveyard card with a counter in one step', () => {
    const c = card({ zone: 'graveyard' });
    const onCounter = pick(c, 'Exile with counter…');
    expect(onCounter).toHaveBeenCalledWith(c, true);
  });

  it('is only the moves without a dialog to open', () => {
    const titles = zoneCardMenu(card()).map((i) => i.title);
    expect(titles).not.toContain('Add counter…');
    expect(titles).toContain('Move to hand');
  });
});
