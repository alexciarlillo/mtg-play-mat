import type { CardView } from '@shared/game';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BulkMoveDialog from './BulkMoveDialog';

const permanent = (
  name: string,
  typeLine: string,
  extra: Partial<CardView> = {}
): CardView => ({
  instanceId: `p1:${name}`,
  ref: { id: `id-${name}`, name, typeLine, faces: [{ name, typeLine }] },
  owner: 'p1',
  controller: 'p1',
  zone: 'battlefield',
  position: { x: 0, y: 0 },
  tapped: false,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
  ...extra,
});

const battlefield = [
  permanent('Forest', 'Basic Land — Forest'),
  permanent('Bear', 'Creature — Bear'),
  permanent('Ring', 'Artifact'),
  // Face down, as the public view shows it: a 2/2 creature.
  permanent('Hidden', 'Land', { faceDown: true, ref: null }),
];

let dispatch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  dispatch = vi.fn(async () => {});
  Object.assign(window, { api: { dispatch } });
});

afterEach(cleanup);

describe('BulkMoveDialog', () => {
  it('counts each group, with face-down permanents as creatures', () => {
    render(
      <BulkMoveDialog
        playerId="p1"
        battlefield={battlefield}
        onClose={() => {}}
      />
    );
    const row = (name: string) =>
      screen.getByRole('rowheader', { name: new RegExp(`^${name}`) });
    expect(row('All permanents')).toHaveTextContent('(4)');
    expect(row('Nonland permanents')).toHaveTextContent('(3)');
    expect(row('Creatures')).toHaveTextContent('(2)');
    expect(row('Artifacts and enchantments')).toHaveTextContent('(1)');
    expect(row('Lands')).toHaveTextContent('(1)');
  });

  it('sends one moveAll and closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BulkMoveDialog
        playerId="p1"
        battlefield={battlefield}
        onClose={onClose}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Creatures to graveyard' })
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: 'moveAll',
      playerId: 'p1',
      from: 'battlefield',
      to: 'graveyard',
      filter: { types: ['Creature'] },
    });
    expect(onClose).toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'All permanents to hand' })
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'moveAll',
      playerId: 'p1',
      from: 'battlefield',
      to: 'hand',
    });
  });

  it('disables a group with nothing in it', () => {
    render(
      <BulkMoveDialog
        playerId="p1"
        battlefield={[battlefield[0]]}
        onClose={() => {}}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Creatures to exile' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Lands to exile' })
    ).toBeEnabled();
  });
});
