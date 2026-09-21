import type { CardView, PublicView } from '@shared/game';
import type { PeerInfo } from '@shared/net/protocol';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ContextMenuProvider } from '../../../ui/ContextMenuProvider';
import { fieldBounds } from './layout';
import OpponentSide from './OpponentSide';

const peer: PeerInfo = {
  playerId: 'p2',
  name: 'Mira Castellan',
  appVersion: '0.0.0',
};

const card: CardView = {
  instanceId: 'p2:1',
  ref: {
    id: '409f9b88-f03e-40b6-9883-68c14c37c0de',
    name: 'Grizzly Bears',
    typeLine: 'Creature — Bear',
    faces: [{ name: 'Grizzly Bears', typeLine: 'Creature — Bear' }],
  },
  owner: 'p2',
  controller: 'p2',
  zone: 'battlefield',
  position: { x: 0, y: 0 },
  tapped: true,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
};

const view: PublicView = {
  seq: 1,
  playerId: 'p2',
  name: peer.name,
  life: 40,
  counters: {},
  mulligans: 0,
  keptHand: true,
  zones: { battlefield: [card], graveyard: [], exile: [], command: [] },
  handCount: 7,
  libraryCount: 53,
  commanderDamage: [],
  dummies: [],
};

const renderSide = (compact: boolean) => {
  Object.assign(window, { api: { dispatch: vi.fn(() => Promise.resolve()) } });
  return render(
    <ContextMenuProvider>
      <OpponentSide peer={peer} view={view} seat={0} compact={compact} />
    </ContextMenuProvider>
  );
};

describe('OpponentSide', () => {
  it('shifts the field right by the turned card reserve', () => {
    renderSide(true);
    const { offsetX } = fieldBounds(view.zones.battlefield);
    expect(offsetX).toBeGreaterThan(0);
    expect(
      screen.getByTestId('opponent-battlefield').firstElementChild
    ).toHaveStyle({ transform: `translateX(${offsetX}px)` });
  });

  it('keeps the whole name in a pod', () => {
    renderSide(true);
    const name = screen.getByTestId('opponent-name');
    expect(name).toHaveTextContent('Mira Castellan');
    expect(name.className).not.toContain('truncate');
  });

  it('frames a pod seat so it reads on its own', () => {
    const { unmount } = renderSide(true);
    expect(screen.getByTestId('opponent-side').className).toContain('rounded');
    unmount();
    renderSide(false);
    expect(screen.getByTestId('opponent-side').className).not.toContain(
      'rounded'
    );
  });
});
