import type { CardView, PublicView } from '@shared/game';
import type { PeerInfo } from '@shared/net/protocol';
import { render, screen, within } from '@testing-library/react';
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

const commander: CardView = {
  ...card,
  instanceId: 'p2:2',
  ref: {
    id: '9d5b2e2e-27f7-4f06-9b8a-2c3f2c5d1a11',
    name: 'Colossal Dreadmaw',
    typeLine: 'Creature \u2014 Dinosaur',
    faces: [
      { name: 'Colossal Dreadmaw', typeLine: 'Creature \u2014 Dinosaur' },
    ],
  },
  zone: 'command',
  position: null,
  tapped: false,
  isCommander: true,
};

const renderSide = (compact: boolean, own: PublicView = view) => {
  Object.assign(window, { api: { dispatch: vi.fn(() => Promise.resolve()) } });
  return render(
    <ContextMenuProvider>
      <OpponentSide peer={peer} view={own} seat={0} compact={compact} />
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

  it('pins a duel seat command zone below its scrolling column', () => {
    const withCommander: PublicView = {
      ...view,
      zones: { ...view.zones, command: [commander] },
    };
    const { unmount } = renderSide(false, withCommander);
    const pinned = screen.getByTestId('opponent-command').parentElement;
    expect(pinned?.className).toContain('shrink-0');
    const scroller = pinned?.previousElementSibling;
    expect(scroller?.className).toContain('overflow-y-auto');
    // Counts and life scroll; the command zone and its tax never do.
    expect(scroller).toContainElement(screen.getByTestId('opponent-library'));
    expect(scroller).toContainElement(screen.getByTestId('opponent-life'));

    // A pod keeps its counts and command zone in one scrolling column,
    // so no count can fall below a fold the seat cannot show.
    unmount();
    renderSide(true, withCommander);
    const inColumn = screen.getByTestId('opponent-command').parentElement;
    expect(inColumn).toContainElement(screen.getByTestId('opponent-library'));
  });

  it('keeps the whole name in a pod', () => {
    renderSide(true);
    const name = screen.getByTestId('opponent-name');
    expect(name).toHaveTextContent('Mira Castellan');
    expect(name.className).not.toContain('truncate');
  });

  it('keeps a pod name clear of the hide button and the life total', () => {
    Object.assign(window, {
      api: { dispatch: vi.fn(() => Promise.resolve()) },
    });
    const { unmount } = render(
      <ContextMenuProvider>
        <OpponentSide
          peer={peer}
          view={view}
          compact
          onToggleHidden={vi.fn()}
        />
      </ContextMenuProvider>
    );
    // The name has the panel's width to itself, so a long surname wraps
    // on the space instead of breaking inside the word.
    const name = screen.getByTestId('opponent-name');
    const above = name.previousElementSibling as HTMLElement;
    expect(within(above).getByTestId('opponent-hide')).toBeInTheDocument();
    expect(within(above).getByTestId('opponent-life')).toBeInTheDocument();
    expect(name.parentElement?.className).toContain('flex-col');

    unmount();
    render(
      <ContextMenuProvider>
        <OpponentSide peer={peer} view={view} onToggleHidden={vi.fn()} />
      </ContextMenuProvider>
    );
    // A duel panel is wide enough to keep them on one line.
    const duel = screen.getByTestId('opponent-name')
      .parentElement as HTMLElement;
    expect(within(duel).getByTestId('opponent-life')).toBeInTheDocument();
    expect(within(duel).getByTestId('opponent-hide')).toBeInTheDocument();
  });

  it('drops the card-sized piles in a pod, keeping counts and browsing', () => {
    const { unmount } = renderSide(true);
    const graveyard = screen.getByTestId('opponent-graveyard');
    expect(graveyard.querySelector('.aspect-card')).toBeNull();
    expect(
      screen.getByRole('button', { name: "Browse opponent's graveyard" })
    ).toBeInTheDocument();
    expect(screen.getByTestId('opponent-library')).toHaveAttribute(
      'data-count',
      '53'
    );
    expect(screen.getByTestId('opponent-hand-count')).toHaveAttribute(
      'data-count',
      '7'
    );

    unmount();
    renderSide(false);
    expect(
      screen.getByTestId('opponent-graveyard').querySelector('.aspect-card')
    ).not.toBeNull();
  });

  it('shows the command zone and its tax in a pod', () => {
    const commanderView: PublicView = {
      ...view,
      zones: { ...view.zones, command: [commander] },
    };
    renderSide(true, commanderView);
    const zone = screen.getByTestId('opponent-command');
    expect(zone).toHaveTextContent('Command zone');
    expect(within(zone).getByTestId('commander-tax')).toHaveTextContent(
      'Tax +0'
    );
  });

  it('leaves a pod seat unframed, with square corners', () => {
    const { unmount } = renderSide(true);
    const seat = screen.getByTestId('opponent-side').className;
    expect(seat).not.toContain('ring');
    expect(seat).not.toContain('rounded');
    expect(seat).toContain('overflow-hidden');
    unmount();
    renderSide(false);
    const duel = screen.getByTestId('opponent-side').className;
    expect(duel).not.toContain('ring');
    expect(duel).not.toContain('rounded');
  });
});
