import type { CardFacts } from '@shared/cardQuery';
import type { CardView } from '@shared/game';
import { defaultSettings, type Settings } from '@shared/settings';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextMenuProvider } from '../../../ui/ContextMenuProvider';
import ZoneBrowser from '../board/ZoneBrowser';
import CardBrowser from './CardBrowser';

let next = 0;

const card = (name: string, typeLine: string, zone = 'library'): CardView => {
  next += 1;
  return {
    instanceId: `p1:${next}`,
    ref: { id: `cb-${name}`, name, typeLine, faces: [{ name, typeLine }] },
    owner: 'p1',
    controller: 'p1',
    zone: zone as CardView['zone'],
    position: null,
    tapped: false,
    faceDown: false,
    faceIndex: 0,
    counters: {},
    isToken: false,
    attachedTo: null,
  };
};

const facts: Record<string, CardFacts> = Object.fromEntries(
  (
    [
      ['Forest', 0, []],
      ['Llanowar Elves', 1, ['G']],
      ['Lightning Bolt', 1, ['R']],
      ['Colossal Dreadmaw', 6, ['G']],
    ] as const
  ).map(([name, mv, colors]) => [
    `cb-${name}`,
    {
      mv,
      colors: [...colors],
      colorIdentity: [...colors],
      keywords: [],
      faces: [],
    },
  ])
);

let settings: Settings;
let pushSettings: (next: Settings) => void;
const updateSettings = vi.fn((patch: Partial<Settings>) => {
  settings = { ...settings, ...patch };
  return Promise.resolve(settings);
});

beforeEach(() => {
  settings = defaultSettings;
  localStorage.clear();
  Object.assign(window, {
    api: {
      getCardFacts: (ids: string[]) =>
        Promise.resolve(
          Object.fromEntries(
            ids.filter((id) => facts[id]).map((id) => [id, facts[id]])
          )
        ),
      getSettings: () => Promise.resolve(settings),
      updateSettings,
      onSettingsChanged: (listener: (next: Settings) => void) => {
        pushSettings = listener;
        return () => {};
      },
    },
  });
});

afterEach(() => {
  updateSettings.mockClear();
});

const library = () => [
  ...Array.from({ length: 24 }, () => card('Forest', 'Basic Land — Forest')),
  card('Llanowar Elves', 'Creature — Elf Druid'),
  card('Lightning Bolt', 'Instant'),
  card('Colossal Dreadmaw', 'Creature — Dinosaur'),
];

const Picker = ({
  cards,
  onPicked,
}: {
  cards: CardView[];
  onPicked?(ids: string[]): void;
}) => {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <CardBrowser
      zone="library"
      cards={cards}
      label="Search the library"
      testId="library-search"
      tileTestId="search-card"
      picked={picked}
      onPickedChange={(ids) => {
        setPicked(ids);
        onPicked?.(ids);
      }}
    />
  );
};

const renderIn = (ui: React.ReactNode) =>
  render(<ContextMenuProvider>{ui}</ContextMenuProvider>);

const tiles = () => screen.queryAllByTestId('search-card');
const tileNames = () => tiles().map((el) => el.dataset.cardName);
const waitForFacts = () => act(() => Promise.resolve());

describe('CardBrowser', () => {
  it('stacks 24 Forests into one tile and picks one per click', async () => {
    const onPicked = vi.fn();
    const cards = library();
    renderIn(<Picker cards={cards} onPicked={onPicked} />);
    await waitForFacts();
    expect(tileNames()).toEqual([
      'Colossal Dreadmaw',
      'Forest',
      'Lightning Bolt',
      'Llanowar Elves',
    ]);
    const forests = tiles()[1]!;
    expect(forests).toHaveAttribute('data-count', '24');
    expect(within(forests).getByTestId('stack-count')).toHaveTextContent('×24');

    const forestIds = cards.slice(0, 24).map((c) => c.instanceId);
    fireEvent.click(within(forests).getByTestId('card'));
    const [first] = onPicked.mock.lastCall![0] as string[];
    expect(forestIds).toContain(first);
    fireEvent.click(within(forests).getByTestId('card'));
    const two = onPicked.mock.lastCall![0] as string[];
    expect(two).toHaveLength(2);
    expect(two[0]).toBe(first);
    expect(forestIds).toContain(two[1]);
    expect(two[1]).not.toBe(first);
    expect(forests).toHaveAttribute('data-picked', '2');
    expect(within(forests).getByTestId('stack-count')).toHaveTextContent(
      '2/24'
    );

    fireEvent.click(
      within(forests).getByRole('button', { name: 'Put back one Forest' })
    );
    expect(onPicked).toHaveBeenLastCalledWith([first]);
  });

  it('shows every copy when stacking is off', async () => {
    settings = {
      ...defaultSettings,
      zoneBrowser: {
        ...defaultSettings.zoneBrowser,
        library: { ...defaultSettings.zoneBrowser.library, stack: false },
      },
    };
    renderIn(<Picker cards={library()} />);
    await waitForFacts();
    expect(tiles()).toHaveLength(27);
  });

  it('ORs type chips, ANDs them with the query, and counts', async () => {
    renderIn(<Picker cards={library()} />);
    await waitForFacts();
    expect(screen.getByTestId('browser-count')).toHaveTextContent('27 of 27');
    expect(screen.getByRole('button', { name: 'Creature' })).toHaveTextContent(
      'Creature 2'
    );
    // No sorceries in the zone, so no chip for them.
    expect(screen.queryByRole('button', { name: 'Sorcery' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Creature' }));
    fireEvent.click(screen.getByRole('button', { name: 'Instant' }));
    expect(tileNames()).toEqual([
      'Colossal Dreadmaw',
      'Lightning Bolt',
      'Llanowar Elves',
    ]);
    fireEvent.change(screen.getByLabelText('Search the library'), {
      target: { value: 'mv<=1' },
    });
    expect(tileNames()).toEqual(['Lightning Bolt', 'Llanowar Elves']);
    expect(screen.getByTestId('browser-count')).toHaveTextContent('2 of 27');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(tiles()).toHaveLength(4);
    expect(screen.getByLabelText('Search the library')).toHaveValue('');
  });

  it('filters by subtype, mana value and colour', async () => {
    renderIn(<Picker cards={library()} />);
    await waitForFacts();
    fireEvent.change(screen.getByLabelText('Subtype'), {
      target: { value: 'Elf' },
    });
    expect(tileNames()).toEqual(['Llanowar Elves']);
    fireEvent.change(screen.getByLabelText('Subtype'), {
      target: { value: '' },
    });

    fireEvent.change(screen.getByLabelText('Mana value comparison'), {
      target: { value: '>=' },
    });
    fireEvent.change(screen.getByLabelText('Mana value'), {
      target: { value: '1' },
    });
    expect(tileNames()).toEqual([
      'Colossal Dreadmaw',
      'Lightning Bolt',
      'Llanowar Elves',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Green' }));
    expect(tileNames()).toEqual(['Colossal Dreadmaw', 'Llanowar Elves']);
    fireEvent.change(screen.getByLabelText('Mana value'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Colour match'), {
      target: { value: 'atMost' },
    });
    expect(tileNames()).toEqual([
      'Colossal Dreadmaw',
      'Forest',
      'Llanowar Elves',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Colourless' }));
    expect(screen.getByRole('button', { name: 'Green' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(tileNames()).toEqual(['Forest']);
  });

  it('hides non-matching cards unless asked to show all', async () => {
    renderIn(<Picker cards={library()} />);
    await waitForFacts();
    fireEvent.change(screen.getByLabelText('Search the library'), {
      target: { value: 't:creature' },
    });
    expect(tiles()).toHaveLength(2);
    fireEvent.click(screen.getByLabelText('Show all'));
    expect(tiles()).toHaveLength(4);
    const forest = tiles().find((el) => el.dataset.cardName === 'Forest')!;
    expect(forest).toHaveClass('opacity-40');
    expect(screen.getByTestId('browser-count')).toHaveTextContent('2 of 27');
  });

  it('fills the query from a preset', async () => {
    renderIn(<Picker cards={library()} />);
    await waitForFacts();
    fireEvent.change(screen.getByLabelText('Presets'), {
      target: { value: 't:basic t:land' },
    });
    expect(screen.getByLabelText('Search the library')).toHaveValue(
      't:basic t:land'
    );
    expect(tileNames()).toEqual(['Forest']);
  });

  it('offers the last five queries as recent', async () => {
    const queries = ['a', 'b', 'c', 'd', 'e', 'f', 'b'];
    for (const query of queries) {
      const { unmount } = renderIn(<Picker cards={library()} />);
      fireEvent.change(screen.getByLabelText('Search the library'), {
        target: { value: query },
      });
      unmount();
    }
    renderIn(<Picker cards={library()} />);
    const recent = within(screen.getByLabelText('Presets'))
      .getByRole('group', { name: 'Recent' })
      .querySelectorAll('option');
    expect([...recent].map((o) => o.value)).toEqual(['b', 'f', 'e', 'd', 'c']);
    // The query itself always starts empty.
    expect(screen.getByLabelText('Search the library')).toHaveValue('');
  });

  it('survives storage that throws', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });
    const { unmount } = renderIn(<Picker cards={library()} />);
    fireEvent.change(screen.getByLabelText('Search the library'), {
      target: { value: 'forest' },
    });
    expect(() => unmount()).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('focuses the query box on /', async () => {
    renderIn(<Picker cards={library()} />);
    const box = screen.getByLabelText('Search the library');
    box.blur();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(box).toHaveFocus();
  });

  it('never offers zone order for the library', async () => {
    renderIn(<Picker cards={library()} />);
    const sorts = [
      ...(screen.getByLabelText('Sort') as HTMLSelectElement).options,
    ].map((o) => o.value);
    expect(sorts).not.toContain('newest');
  });

  it('counts each type chip by what it matches on any face', async () => {
    const cards = [
      card('Ornithopter', 'Artifact Creature — Thopter'),
      card('Darksteel Citadel', 'Artifact Land'),
      card(
        'Shatterskull Smashing // Shatterskull, the Hammer Pass',
        'Sorcery // Land'
      ),
      card('Forest', 'Basic Land — Forest'),
    ];
    renderIn(<Picker cards={cards} />);
    await waitForFacts();
    const chip = (name: string) => screen.getByRole('button', { name });
    expect(chip('Artifact')).toHaveTextContent('Artifact 2');
    expect(chip('Creature')).toHaveTextContent('Creature 1');
    expect(chip('Land')).toHaveTextContent('Land 3');
    expect(chip('Sorcery')).toHaveTextContent('Sorcery 1');
    fireEvent.click(chip('Artifact'));
    expect(tiles()).toHaveLength(2);
  });

  it('picks with the keyboard in grid and list', async () => {
    const onPicked = vi.fn();
    renderIn(<Picker cards={library()} onPicked={onPicked} />);
    await waitForFacts();
    const grid = screen.getByRole('button', { name: 'Forest ×24' });
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(onPicked).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    const row = tiles()[1]!;
    expect(row).toHaveAttribute('role', 'button');
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(row, { key: ' ' });
    expect(onPicked.mock.lastCall![0]).toHaveLength(2);
  });

  it('waits for the saved view before showing or saving one', async () => {
    let answer: (value: Settings) => void = () => {};
    window.api.getSettings = () =>
      new Promise<Settings>((resolve) => {
        answer = resolve;
      });
    const saved = {
      ...defaultSettings,
      zoneBrowser: {
        ...defaultSettings.zoneBrowser,
        graveyard: { layout: 'list', sort: 'mv', group: 'type', stack: false },
      },
    } as Settings;
    renderIn(<Picker cards={library()} />);
    expect(tiles()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(updateSettings).not.toHaveBeenCalled();
    await act(async () => answer(saved));
    expect(tiles()).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(updateSettings).toHaveBeenLastCalledWith({
      zoneBrowser: {
        ...saved.zoneBrowser,
        library: { ...saved.zoneBrowser.library, layout: 'list' },
      },
    });
  });

  it('saves the view per zone kind and lists in rows', async () => {
    renderIn(<Picker cards={library()} />);
    await waitForFacts();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(updateSettings).toHaveBeenLastCalledWith({
      zoneBrowser: {
        ...defaultSettings.zoneBrowser,
        library: { ...defaultSettings.zoneBrowser.library, layout: 'list' },
      },
    });
    expect(screen.getByTestId('library-search')).toHaveAttribute(
      'data-layout',
      'list'
    );
    expect(tiles()[1]?.tagName).toBe('LI');
    expect(tiles()[1]).toHaveTextContent('×24Forest');

    fireEvent.change(screen.getByLabelText('Group'), {
      target: { value: 'type' },
    });
    expect(
      screen.getAllByTestId('browser-group').map((el) => el.textContent)
    ).toEqual(['Creature · 2', 'Instant · 1', 'Land · 24']);

    // A change from another window is picked up too.
    act(() =>
      pushSettings({
        ...settings,
        zoneBrowser: {
          ...settings.zoneBrowser,
          library: { ...settings.zoneBrowser.library, group: 'none' },
        },
      })
    );
    expect(screen.queryAllByTestId('browser-group')).toHaveLength(0);
  });
});

describe('ZoneBrowser', () => {
  const graveyard = () => [
    card('Lightning Bolt', 'Instant', 'graveyard'),
    card('Llanowar Elves', 'Creature — Elf Druid', 'graveyard'),
    card('Forest', 'Basic Land — Forest', 'graveyard'),
    card('Lightning Bolt', 'Instant', 'graveyard'),
  ];
  const names = () =>
    screen.getAllByTestId('zone-card').map((el) => el.dataset.cardName);

  it.each([
    ['graveyard', 'Graveyard'],
    ['exile', 'Exile'],
  ] as const)(
    '%s starts newest first, filters and groups',
    async (zone, title) => {
      renderIn(
        <ZoneBrowser
          title={title}
          zone={zone}
          cards={graveyard()}
          onClose={() => {}}
        />
      );
      await waitForFacts();
      expect(
        screen.getByRole('dialog', { name: `${title} (4)` })
      ).toBeVisible();
      expect(names()).toEqual(['Lightning Bolt', 'Forest', 'Llanowar Elves']);
      expect(screen.getAllByTestId('zone-card')[0]).toHaveAttribute(
        'data-count',
        '2'
      );
      fireEvent.change(screen.getByLabelText(`Search the ${zone}`), {
        target: { value: 't:creature or t:land' },
      });
      expect(names()).toEqual(['Forest', 'Llanowar Elves']);
      fireEvent.change(screen.getByLabelText('Group'), {
        target: { value: 'type' },
      });
      expect(
        screen.getAllByTestId('browser-group').map((el) => el.textContent)
      ).toEqual(['Creature · 1', 'Land · 1']);
      expect(screen.getByText('Right-click a card to move it.')).toBeVisible();
    }
  );

  it('lists a face-down card without its type', async () => {
    settings = {
      ...defaultSettings,
      zoneBrowser: {
        ...defaultSettings.zoneBrowser,
        exile: { ...defaultSettings.zoneBrowser.exile, layout: 'list' },
      },
    };
    const hidden = {
      ...card('Forest', 'Basic Land', 'exile'),
      ref: null,
      faceDown: true,
    };
    renderIn(
      <ZoneBrowser
        title="Exile"
        zone="exile"
        cards={[hidden]}
        onClose={() => {}}
      />
    );
    await waitForFacts();
    const row = screen.getByTestId('zone-card');
    expect(row).toHaveTextContent('Face-down card—');
    expect(row).not.toHaveTextContent('All');
  });

  it("keeps an opponent's zone read-only", async () => {
    renderIn(
      <ZoneBrowser
        title="Bob's graveyard"
        zone="graveyard"
        cards={graveyard()}
        onClose={() => {}}
        readOnly
      />
    );
    await waitForFacts();
    fireEvent.contextMenu(
      within(screen.getAllByTestId('zone-card')[0]!).getByTestId('card')
    );
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(screen.queryByText('Right-click a card to move it.')).toBeNull();
  });
});
