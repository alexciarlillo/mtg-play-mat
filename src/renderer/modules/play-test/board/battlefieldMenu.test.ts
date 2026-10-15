import type { CardView } from '@shared/game';
import type { RevealTarget } from '@shared/net/revealTargets';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { battlefieldMenu } from './battlefieldMenu';

const card = (patch: Partial<CardView> = {}): CardView => ({
  instanceId: 'p1:7',
  ref: null,
  owner: 'p1',
  controller: 'p1',
  zone: 'battlefield',
  position: null,
  tapped: false,
  faceDown: true,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
  ...patch,
});

const targets: RevealTarget[] = [
  { playerId: 'bob', name: 'Bob', ready: true },
  { playerId: 'dave', name: 'Dave', ready: false, why: 'no game open' },
];

const dispatch = vi.fn(() => Promise.resolve());
const revealTo = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.assign(window, { api: { dispatch, revealTo } });
});

afterEach(() => {
  dispatch.mockClear();
  revealTo.mockClear();
});

const titles = (c: CardView) =>
  battlefieldMenu(c, { revealTargets: targets }).map((item) => item.title);

describe('revealing a face-down permanent', () => {
  it('is offered to its owner only, everyone first', () => {
    expect(titles(card())).toEqual(
      expect.arrayContaining([
        'Reveal to everyone',
        'Reveal to Bob',
        'Reveal to Dave (no game open)',
      ])
    );
    expect(titles(card({ faceDown: false }))).not.toContain('Reveal to Bob');
    expect(titles(card({ owner: 'bob' }))).not.toContain('Reveal to Bob');
  });

  it('asks main to show it to one player, or reveals it to all', () => {
    const menu = battlefieldMenu(card(), { revealTargets: targets });
    const pick = (title: string) =>
      menu.find((item) => item.title === title)?.action;
    expect(pick('Reveal to Dave (no game open)')).toBeNull();
    pick('Reveal to Bob')?.();
    expect(revealTo).toHaveBeenCalledWith(
      { to: 'bob', source: 'faceDown', instanceId: 'p1:7' },
      undefined
    );
    pick('Reveal to everyone')?.();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'reveal',
      playerId: 'p1',
      source: 'card',
      instanceId: 'p1:7',
    });
  });

  it('stays one plain item outside a pod', () => {
    const plain = battlefieldMenu(card()).map((item) => item.title);
    expect(plain).toContain('Reveal');
    expect(plain).not.toContain('Reveal to everyone');
  });
});
