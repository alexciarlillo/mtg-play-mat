import { type CardView, parsePlayerAction } from '@shared/game';
import type { TableEntry } from '@shared/net/remoteViews';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CardBadges from '../../../ui/CardBadges';
import { powerToughness } from '../../../ui/cardStats';
import { battlefieldMenu, selectionMenu } from './battlefieldMenu';
import { AbilitiesDialog, PowerToughnessDialog } from './CardStateDialogs';
import PlayerCounters from './PlayerCounters';
import { describeRoll } from './pod';
import TableLog from './TableLog';

const card = (patch: Partial<CardView> = {}): CardView => ({
  instanceId: 'p1:1',
  ref: {
    id: 'bear',
    name: 'Bear',
    typeLine: 'Creature — Bear',
    faces: [
      { name: 'Bear', typeLine: 'Creature — Bear', power: '2', toughness: '2' },
    ],
    power: '2',
    toughness: '2',
  },
  owner: 'p1',
  controller: 'p1',
  zone: 'battlefield',
  position: { x: 0, y: 0 },
  tapped: true,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
  ...patch,
});

const land = (patch: Partial<CardView> = {}): CardView =>
  card({
    instanceId: 'p1:2',
    ref: {
      id: 'forest',
      name: 'Forest',
      typeLine: 'Basic Land — Forest',
      faces: [{ name: 'Forest', typeLine: 'Basic Land — Forest' }],
    },
    ...patch,
  });

const dispatch = vi.fn(() => Promise.resolve());
const netRoll = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.assign(window, { api: { dispatch, netRoll } });
});

afterEach(() => {
  dispatch.mockClear();
  netRoll.mockClear();
});

describe('a set base power and toughness', () => {
  it('replaces the printed values, with counters on top', () => {
    expect(
      powerToughness(card({ ptOverride: { power: 5, toughness: 1 } }))
    ).toBe('5/1');
    expect(
      powerToughness(
        card({
          ptOverride: { power: 0, toughness: 0 },
          counters: { '+1/+1': 3 },
        })
      )
    ).toBe('3/3');
    expect(
      powerToughness(land({ ptOverride: { power: 0, toughness: 0 } }))
    ).toBe('0/0');
  });
});

describe('CardBadges', () => {
  it("shows doesn't untap, abilities, and a marked P/T", () => {
    render(
      <CardBadges
        card={card({
          doesntUntap: true,
          abilities: ['first strike', 'goaded'],
          ptOverride: { power: 4, toughness: 4 },
        })}
      />
    );
    expect(screen.getByTestId('doesnt-untap-badge')).toHaveTextContent(
      'No untap'
    );
    expect(
      screen.getAllByTestId('ability-badge').map((b) => b.textContent)
    ).toEqual(['First strike', 'Goaded']);
    expect(screen.getByTestId('pt-badge')).toHaveTextContent('4/4');
    expect(screen.getByTestId('pt-badge')).toHaveAttribute('data-set', 'true');
  });

  it('shows nothing extra without them', () => {
    render(<CardBadges card={card()} />);
    expect(screen.queryByTestId('ability-badges')).toBeNull();
    expect(screen.queryByTestId('pt-badge')).toBeNull();
  });
});

const titles = (items: { title: string }[]) => items.map((i) => i.title);
const pick = (
  items: { title: string; action: (() => void) | null }[],
  t: string
) => items.find((item) => item.title === t)?.action?.();

describe('card state menus', () => {
  it('offers the entries, and toggles doesnt-untap in one action', () => {
    const onCardState = vi.fn();
    const menu = battlefieldMenu(card(), { onCardState });
    expect(titles(menu)).toEqual(
      expect.arrayContaining(["Doesn't untap", 'Set base P/T…', 'Abilities…'])
    );
    expect(titles(menu)).not.toContain('Reset P/T');
    pick(menu, "Doesn't untap");
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setCardState',
      playerId: 'p1',
      instanceIds: ['p1:1'],
      doesntUntap: true,
    });
    pick(menu, 'Abilities…');
    expect(onCardState).toHaveBeenCalledWith([card()], 'abilities');
  });

  it('says a non-creature becomes one, and offers a reset once set', () => {
    expect(titles(battlefieldMenu(land(), { onCardState: vi.fn() }))).toContain(
      'Becomes a creature…'
    );
    const set = land({
      doesntUntap: true,
      ptOverride: { power: 3, toughness: 3 },
    });
    const menu = battlefieldMenu(set, { onCardState: vi.fn() });
    expect(titles(menu)).toEqual(
      expect.arrayContaining(['Untap normally', 'Set base P/T…', 'Reset P/T'])
    );
    pick(menu, 'Reset P/T');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setCardState',
      playerId: 'p1',
      instanceIds: ['p1:2'],
      ptOverride: null,
    });
  });

  it('acts on a whole selection at once', () => {
    const cards = [card(), land()];
    const onCardState = vi.fn();
    const menu = selectionMenu(cards, vi.fn(), onCardState);
    pick(menu, "Doesn't untap (2)");
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setCardState',
      playerId: 'p1',
      instanceIds: ['p1:1', 'p1:2'],
      doesntUntap: true,
    });
    // A creature among them makes it a change of base, not a new creature.
    pick(menu, 'Set base P/T… (2)');
    expect(onCardState).toHaveBeenCalledWith(cards, 'pt');
  });
});

describe('PowerToughnessDialog', () => {
  it('starts at the printed values and sets a new base', async () => {
    const onClose = vi.fn();
    render(<PowerToughnessDialog cards={[card()]} onClose={onClose} />);
    const power = screen.getByLabelText('Power');
    expect(power).toHaveValue(2);
    await userEvent.clear(power);
    await userEvent.type(power, '6');
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setCardState',
      playerId: 'p1',
      instanceIds: ['p1:1'],
      ptOverride: { power: 6, toughness: 2 },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('titles a land as becoming a creature', () => {
    render(<PowerToughnessDialog cards={[land()]} onClose={vi.fn()} />);
    expect(screen.getByText('Becomes a creature')).toBeInTheDocument();
  });
});

describe('AbilitiesDialog', () => {
  it('adds and removes in one action, typed ones included', async () => {
    render(
      <AbilitiesDialog
        cards={[card({ abilities: ['flying'] })]}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'flying' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await userEvent.click(screen.getByRole('button', { name: 'flying' }));
    await userEvent.click(screen.getByRole('button', { name: 'goaded' }));
    await userEvent.type(
      screen.getByLabelText('Other ability'),
      'protection from red{Enter}'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setCardState',
      playerId: 'p1',
      instanceIds: ['p1:1'],
      addAbilities: ['goaded', 'protection from red'],
      removeAbilities: ['flying'],
    });
  });

  it('removes a selection’s abilities that add up past one card’s limit', async () => {
    const typed = (from: number) =>
      Array.from({ length: 7 }, (_, i) => `power ${from + i}`);
    render(
      <AbilitiesDialog
        cards={[card({ abilities: typed(0) }), land({ abilities: typed(7) })]}
        onClose={vi.fn()}
      />
    );
    for (let i = 0; i < 14; i += 1) {
      const chip = screen.getByRole('button', { name: `power ${i}` });
      // Mixed goes on first, then off.
      await userEvent.click(chip);
      await userEvent.click(chip);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const [action] = dispatch.mock.calls.at(-1) as unknown as [object];
    expect(parsePlayerAction(action)).toMatchObject({
      removeAbilities: [...typed(0), ...typed(7)],
    });
  });

  it('shows a keyword only some of a selection have as mixed', () => {
    render(
      <AbilitiesDialog
        cards={[card({ abilities: ['haste'] }), land()]}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'haste' })).toHaveAttribute(
      'aria-pressed',
      'mixed'
    );
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });
});

describe('the mana pool', () => {
  it('adds on click, removes on right-click, and empties', async () => {
    render(
      <PlayerCounters counters={{ 'mana:G': 2, poison: 1 }} playerId="p1" />
    );
    const pool = screen.getByTestId('mana-pool');
    const green = within(pool).getByRole('button', { name: /2 green mana/ });
    await userEvent.click(green);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'adjustPlayerCounter',
      playerId: 'p1',
      counter: 'mana:G',
      delta: 1,
    });
    await userEvent.pointer({ keys: '[MouseRight]', target: green });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'adjustPlayerCounter',
      playerId: 'p1',
      counter: 'mana:G',
      delta: -1,
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Empty mana pool' })
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'emptyManaPool',
      playerId: 'p1',
    });
    // Mana is not listed again among the plain counters.
    expect(
      screen
        .getByTestId('player-counters')
        .querySelector('[data-counter="mana:G"]')
    ).toBeNull();
  });

  it('shows another player only the colours they have', () => {
    render(<PlayerCounters counters={{ 'mana:U': 1 }} />);
    const pips = within(
      screen.getByTestId('opponent-mana-pool')
    ).getAllByLabelText(/mana$/);
    expect(pips.map((p) => p.getAttribute('data-mana'))).toEqual(['U']);
  });
});

describe('dice', () => {
  const log: TableEntry[] = [];

  it('rolls every die from the table panel', async () => {
    render(<TableLog log={log} onCustomDie={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Roll a d12' }));
    expect(netRoll).toHaveBeenLastCalledWith({ type: 'die', sides: 12 });
    await userEvent.click(screen.getByRole('button', { name: 'Roll two d6' }));
    expect(netRoll).toHaveBeenLastCalledWith({
      type: 'dice',
      count: 2,
      sides: 6,
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Roll the planar die' })
    );
    expect(netRoll).toHaveBeenLastCalledWith({ type: 'planar' });
  });

  it("greys out the planar die when the host can't roll it", () => {
    render(<TableLog log={log} onCustomDie={vi.fn()} planarDie={false} />);
    expect(screen.getByRole('button', { name: 'Roll two d6' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Roll the planar die' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Roll a d8' })).toBeEnabled();
  });

  it('describes the new results', () => {
    expect(describeRoll({ type: 'dice', sides: 6, results: [2, 5] })).toBe(
      'rolled 2d6: 2 + 5 = 7'
    );
    expect(describeRoll({ type: 'planar', result: 'chaos' })).toBe(
      'rolled the planar die: chaos'
    );
  });
});
