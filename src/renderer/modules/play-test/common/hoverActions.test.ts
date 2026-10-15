import type { CardView } from '@shared/game';
import { describe, expect, it } from 'vitest';

import type { HoverKey } from '../../../ui/hoverKeys';
import { battlefieldHoverAction, handHoverAction } from './hoverActions';

const bears: CardView = {
  instanceId: 'p1:7',
  ref: {
    id: '409f9b88-f03e-40b6-9883-68c14c37c0de',
    name: 'Grizzly Bears',
    typeLine: 'Creature — Bear',
    faces: [{ name: 'Grizzly Bears', typeLine: 'Creature — Bear' }],
  },
  owner: 'p1',
  controller: 'p1',
  zone: 'battlefield',
  position: null,
  tapped: false,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
};

const dfc: CardView = {
  ...bears,
  ref: {
    id: 'dfc',
    name: 'Delver of Secrets // Insectile Aberration',
    typeLine: 'Creature — Human Wizard // Creature — Human Insect',
    layout: 'transform',
    faces: [
      { name: 'Delver of Secrets', typeLine: 'Creature — Human Wizard' },
      { name: 'Insectile Aberration', typeLine: 'Creature — Human Insect' },
    ],
  },
};

const id = bears.instanceId;
const move = (to: string, index?: number) => ({
  type: 'moveCard',
  instanceId: id,
  to,
  ...(index !== undefined && { index }),
});

describe('battlefieldHoverAction', () => {
  it('taps, copies and moves a permanent', () => {
    const on = (key: HoverKey) => battlefieldHoverAction(bears, key);
    expect(on('t')).toEqual({ type: 'toggleTap', instanceId: id });
    expect(on('x')).toEqual({ type: 'copyCard', instanceId: id });
    expect(on('g')).toEqual(move('graveyard'));
    expect(on('e')).toEqual(move('exile'));
    expect(on('h')).toEqual(move('hand'));
    expect(on('l')).toEqual(move('library', 0));
    expect(on('L')).toEqual(move('library'));
  });

  it('does nothing that the menu would not offer', () => {
    expect(battlefieldHoverAction(bears, 'b')).toBeNull();
    expect(battlefieldHoverAction(bears, 'c')).toBeNull();
    expect(
      battlefieldHoverAction({ ...bears, isCommander: true }, 'c')
    ).toEqual(move('command'));
  });

  it('transforms a double-faced card, and turns others face down or up', () => {
    expect(battlefieldHoverAction(dfc, 'f')).toEqual({
      type: 'transform',
      instanceId: id,
    });
    expect(battlefieldHoverAction(bears, 'f')).toEqual({
      type: 'setFaceDown',
      instanceId: id,
      faceDown: true,
    });
    expect(
      battlefieldHoverAction({ ...bears, faceDown: true, ref: null }, 'f')
    ).toEqual({ type: 'setFaceDown', instanceId: id, faceDown: false });
  });
});

describe('handHoverAction', () => {
  const inHand: CardView = { ...bears, zone: 'hand' };

  it('plays, discards, exiles and puts back', () => {
    const on = (key: HoverKey) => handHoverAction(inHand, key);
    expect(on('b')).toEqual(move('battlefield'));
    expect(on('g')).toEqual(move('graveyard'));
    expect(on('e')).toEqual(move('exile'));
    expect(on('l')).toEqual(move('library', 0));
    expect(on('L')).toEqual(move('library'));
  });

  it('ignores battlefield-only keys and the hand itself', () => {
    for (const key of ['t', 'f', 'x', 'h', 'c'] as const) {
      expect(handHoverAction(inHand, key)).toBeNull();
    }
    expect(handHoverAction({ ...inHand, isCommander: true }, 'c')).toEqual(
      move('command')
    );
  });
});
