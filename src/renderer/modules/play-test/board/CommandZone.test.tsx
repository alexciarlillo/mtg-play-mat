import type { CardView, PublicView } from '@shared/game';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextMenuProvider } from '../../../ui/ContextMenuProvider';
import CommandZone from './CommandZone';
import { CommanderDamageTaken, DummyOpponents } from './CommanderTracker';

const commander = (
  instanceId: string,
  name: string,
  patch: Partial<CardView> = {}
): CardView => ({
  instanceId,
  ref: {
    id: '409f9b88-f03e-40b6-9883-68c14c37c0de',
    name,
    typeLine: 'Legendary Creature',
    faces: [{ name, typeLine: 'Legendary Creature' }],
  },
  owner: 'p1',
  controller: 'p1',
  zone: 'command',
  position: null,
  tapped: false,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
  isCommander: true,
  commanderCasts: 0,
  ...patch,
});

const viewWith = (cards: CardView[]): PublicView => ({
  seq: 1,
  playerId: 'p1',
  name: 'Alice',
  life: 40,
  counters: {},
  mulligans: 0,
  keptHand: true,
  zones: {
    battlefield: cards.filter((c) => c.zone === 'battlefield'),
    graveyard: [],
    exile: [],
    command: cards.filter((c) => c.zone === 'command'),
  },
  handCount: 7,
  libraryCount: 90,
  commanderDamage: [],
  dummies: [],
});

const dispatch = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.assign(window, { api: { dispatch } });
});

afterEach(() => {
  dispatch.mockClear();
});

const renderZone = (view: PublicView, readOnly = false) =>
  render(
    <ContextMenuProvider>
      <CommandZone view={view} readOnly={readOnly} />
    </ContextMenuProvider>
  );

describe('CommandZone', () => {
  const partners = viewWith([
    commander('p1:0', 'Tymna'),
    commander('p1:1', 'Thrasios', {
      zone: 'battlefield',
      position: { x: 0, y: 0 },
      commanderCasts: 2,
    }),
  ]);

  it('shows every commander with its tax, wherever it is', () => {
    renderZone(partners);
    const [tymna, thrasios] = screen.getAllByTestId('commander');
    expect(tymna).toHaveAttribute('data-zone', 'command');
    expect(within(tymna).getByTestId('commander-tax')).toHaveTextContent(
      'Tax +0'
    );
    expect(thrasios).toHaveAttribute('data-zone', 'battlefield');
    expect(thrasios).toHaveTextContent('On battlefield');
    expect(within(thrasios).getByTestId('commander-tax')).toHaveTextContent(
      'Tax +4'
    );
    expect(screen.getByTestId('command-zone')).toHaveAttribute(
      'data-drop-zone',
      'command'
    );
  });

  it('casts a commander on click', () => {
    renderZone(partners);
    fireEvent.click(screen.getAllByTestId('card')[0]);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'moveCard',
      instanceId: 'p1:0',
      to: 'battlefield',
    });
  });

  it('offers cast and tax fixes in its menu', () => {
    renderZone(viewWith([commander('p1:0', 'Tymna', { commanderCasts: 1 })]));
    fireEvent.contextMenu(screen.getByTestId('card'));
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items[0]).toBe('Cast');
    expect(items).toContain('Commander tax +2');
    expect(items).toContain('Commander tax −2');
    expect(items).not.toContain('Move to command zone');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Commander tax −2' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'adjustCommanderCasts',
      instanceId: 'p1:0',
      delta: -1,
    });
  });

  it('is inert for an opponent', () => {
    renderZone(partners, true);
    fireEvent.click(screen.getAllByTestId('card')[0]);
    fireEvent.contextMenu(screen.getAllByTestId('card')[0]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
    expect(screen.getByTestId('command-zone')).not.toHaveAttribute(
      'data-drop-zone'
    );
  });
});

describe('CommanderDamageTaken', () => {
  it('adjusts damage per source and flags lethal damage', () => {
    render(
      <CommanderDamageTaken
        playerId="p1"
        sources={[{ source: 'bob/p2:0', name: 'Atraxa' }]}
        taken={[
          { source: 'bob/p2:0', name: 'Atraxa', damage: 4 },
          { source: 'gone/p3:0', name: 'Old foe', damage: 21 },
        ]}
      />
    );
    const [atraxa, old] = screen.getAllByTestId('commander-damage');
    expect(atraxa).toHaveAttribute('data-damage', '4');
    expect(atraxa).not.toHaveAttribute('data-lethal');
    expect(old).toHaveAttribute('data-lethal', 'true');
    expect(old).toHaveTextContent('21+ lethal');

    fireEvent.click(
      screen.getByRole('button', { name: 'More commander damage from Atraxa' })
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: 'adjustCommanderDamage',
      playerId: 'p1',
      source: 'bob/p2:0',
      sourceName: 'Atraxa',
      delta: 1,
    });
  });

  it('is read-only without a player and hidden with no sources', () => {
    const { container, rerender } = render(
      <CommanderDamageTaken playerId={null} sources={[]} taken={[]} />
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <CommanderDamageTaken
        playerId={null}
        sources={[]}
        taken={[{ source: 's', name: 'S', damage: 2 }]}
      />
    );
    expect(screen.getByTestId('commander-damage')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('DummyOpponents', () => {
  it('tracks life and damage from the player’s commanders', () => {
    render(
      <DummyOpponents
        playerId="p1"
        commanders={[{ source: 'p1:0', name: 'Tymna' }]}
        dummies={[
          { id: 'dummy-1', name: 'Opponent 1', life: 40, commanderDamage: [] },
        ]}
      />
    );
    expect(screen.getByTestId('dummy-life')).toHaveTextContent('40');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'More commander damage from Tymna to Opponent 1',
      })
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'adjustCommanderDamage',
      playerId: 'p1',
      dummyId: 'dummy-1',
      source: 'p1:0',
      sourceName: 'Tymna',
      delta: 1,
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Opponent 1 loses 5 life' })
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'adjustDummyLife',
      playerId: 'p1',
      dummyId: 'dummy-1',
      delta: -5,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Opponent 1' }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'removeDummy',
      playerId: 'p1',
      dummyId: 'dummy-1',
    });
  });
});
