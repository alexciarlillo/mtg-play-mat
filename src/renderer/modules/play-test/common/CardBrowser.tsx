import {
  allOf,
  BROWSER_GROUPS,
  BROWSER_SORTS,
  type BrowserGroup,
  type BrowserSort,
  type CardStack,
  CHIP_TYPES,
  type ChipType,
  type Chips,
  chipCount,
  chipsToQuery,
  type Color,
  COLORS,
  type ColorMode,
  emptyChips,
  matchesQuery,
  type MvOp,
  organize,
  parseQuery,
  subtypesOf,
  toSearchable,
} from '@shared/cardQuery';
import type { CardView } from '@shared/game';
import {
  type BrowserView,
  type BrowserZone,
  defaultBrowserViews,
} from '@shared/settings';
import classNames from 'classnames';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import useSettings from '../../../hooks/useSettings';
import Card from '../../../ui/Card';
import { useCardPreview } from '../../../ui/CardPreview';
import { useContextMenu } from '../../../ui/ContextMenuProvider';
import type { ContextMenuSpec } from '../../../ui/ContextMenuStore';
import { useCardFacts } from './cardFacts';
import { recentQueries, rememberQuery } from './recentQueries';

// Queries, not legality checks: they only narrow what's shown.
const LIBRARY_PRESETS: { label: string; query: string }[] = [
  { label: 'Basic land', query: 't:basic t:land' },
  { label: 'Land', query: 't:land' },
  { label: 'Creature', query: 't:creature' },
  { label: 'Creature MV≤3', query: 't:creature mv<=3' },
  { label: 'Artifact', query: 't:artifact' },
  { label: 'Enchantment', query: 't:enchantment' },
  { label: 'Instant/Sorcery', query: 't:instant or t:sorcery' },
  { label: 'Equipment', query: 't:equipment' },
  { label: 'Aura', query: 't:aura' },
];

const SORT_LABELS: Record<BrowserSort, string> = {
  name: 'Name',
  mv: 'Mana value',
  type: 'Type',
  color: 'Colour',
  newest: 'Newest first',
};

const GROUP_LABELS: Record<BrowserGroup, string> = {
  none: 'No groups',
  type: 'By type',
  mv: 'By mana value',
  color: 'By colour',
};

const COLOR_NAMES: Record<Color, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

const COLOR_STYLES: Record<Color | 'C', string> = {
  W: 'bg-amber-50 text-slate-900',
  U: 'bg-sky-600 text-white',
  B: 'bg-slate-800 text-white',
  R: 'bg-red-600 text-white',
  G: 'bg-green-700 text-white',
  C: 'bg-stone-400 text-slate-900',
};

const control = 'rounded px-2 py-1 text-sm ring-1 ring-slate-400';
const select = `${control} bg-white`;

const pressed = (on: boolean) =>
  classNames(control, on ? 'bg-slate-800 text-white' : 'bg-white');

// A short window (the hand window) starts with the filters folded away
// so the cards still get some room.
const ROOMY_HEIGHT = 600;

const isField = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.isContentEditable);

// Until main answers, the view is unknown: saving then would overwrite
// every other zone's saved view with the defaults.
const useBrowserView = (zone: BrowserZone) => {
  const { settings, loaded, update } = useSettings();
  const views = settings.zoneBrowser ?? defaultBrowserViews;
  const view = views[zone];
  const setView = (patch: Partial<BrowserView>) => {
    if (!loaded) return;
    update({ zoneBrowser: { ...views, [zone]: { ...view, ...patch } } }).catch(
      (err: unknown) =>
        console.error('[play-test] could not save the browser view', err)
    );
  };
  return [view, setView, loaded] as const;
};

interface TileProps {
  stack: CardStack;
  layout: BrowserView['layout'];
  testId: string;
  matching: boolean;
  pickedIds: string[];
  onPick?(stack: CardStack): void;
  onUnpick?(stack: CardStack): void;
  menu?(card: CardView): ContextMenuSpec[];
  mv: number | undefined;
}

const Tile = ({
  stack,
  layout,
  testId,
  matching,
  pickedIds,
  onPick,
  onUnpick,
  menu,
  mv,
}: TileProps) => {
  const preview = useCardPreview();
  const contextMenu = useContextMenu();
  const card = stack.cards[0]!;
  const count = stack.cards.length;
  const picks = pickedIds.length;
  const specs = menu?.(card) ?? [];

  const name = card.faceDown || !card.ref ? 'Face-down card' : card.ref.name;
  const pickKeys = onPick && {
    role: 'button',
    tabIndex: 0,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onPick(stack);
    },
  };

  const shared = {
    ...pickKeys,
    'data-testid': testId,
    'data-count': count,
    'data-picked': picks > 0 ? picks : undefined,
    'data-card-name': card.faceDown ? undefined : card.ref?.name,
  };

  const unpick = onUnpick && picks > 0 && count > 1 && (
    <button
      type="button"
      aria-label={`Put back one ${card.ref?.name ?? 'card'}`}
      className="rounded bg-white px-1.5 text-sm leading-5 ring-1 ring-slate-400"
      onClick={(e) => {
        e.stopPropagation();
        onUnpick(stack);
      }}
    >
      −
    </button>
  );

  const countLabel =
    picks > 0 ? `${picks}/${count}` : count > 1 ? `×${count}` : null;

  if (layout === 'grid') {
    return (
      <div
        {...shared}
        aria-label={pickKeys && (count > 1 ? `${name} ×${count}` : name)}
        className={classNames('relative rounded-lg', {
          'outline-4 outline-sky-500': picks > 0,
          'opacity-40': !matching,
        })}
      >
        <Card
          card={card}
          size="sm"
          onClick={onPick && (() => onPick(stack))}
          menu={specs}
        />
        {countLabel && (
          <span
            data-testid="stack-count"
            className={classNames(
              'pointer-events-none absolute right-1 bottom-1 rounded-full px-1.5 text-xs leading-5 font-semibold',
              picks > 0 ? 'bg-sky-600 text-white' : 'bg-slate-900/80 text-white'
            )}
          >
            {countLabel}
          </span>
        )}
        {unpick && <span className="absolute left-1 bottom-1">{unpick}</span>}
      </div>
    );
  }

  const openMenu = (e: MouseEvent) => {
    if (specs.length === 0) return;
    e.preventDefault();
    preview.hide(card.instanceId);
    contextMenu.open({ specs, x: e.pageX, y: e.pageY });
  };

  return (
    <li
      {...shared}
      data-instance-id={card.instanceId}
      className={classNames(
        'flex items-center gap-2 rounded px-2 py-0.5 text-sm',
        picks > 0 ? 'bg-sky-100 ring-1 ring-sky-500' : 'hover:bg-stone-200',
        { 'opacity-40': !matching, 'cursor-pointer': onPick }
      )}
      onClick={onPick && (() => onPick(stack))}
      onContextMenu={openMenu}
      onMouseEnter={(e) => preview.show(card, e.clientX)}
      onMouseLeave={() => preview.hide(card.instanceId)}
    >
      <span className="w-10 shrink-0 text-right tabular-nums text-slate-600">
        {countLabel}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      <span className="hidden min-w-0 flex-1 truncate text-slate-600 sm:inline">
        {card.faceDown || !card.ref ? '—' : card.ref.typeLine}
      </span>
      <span className="w-8 shrink-0 text-right tabular-nums text-slate-600">
        {mv ?? ''}
      </span>
      {unpick}
    </li>
  );
};

interface Props {
  zone: BrowserZone;
  // null while the cards are still loading.
  cards: readonly CardView[] | null;
  // The query box's label.
  label: string;
  testId: string;
  tileTestId: string;
  // Picking is by instance id; one click on a stack picks one more copy.
  picked?: readonly string[];
  onPickedChange?(next: string[]): void;
  menu?(card: CardView): ContextMenuSpec[];
  // Extra controls at the end of the toolbar.
  actions?: ReactNode;
}

// Search, filter, sort, group and stack the cards of one zone. Filters
// hide cards (unless "Show all"); only the view settings are remembered.
const CardBrowser = ({
  zone,
  cards,
  label,
  testId,
  tileTestId,
  picked = [],
  onPickedChange,
  menu,
  actions,
}: Props) => {
  const [view, setView, viewLoaded] = useBrowserView(zone);
  const [query, setQuery] = useState('');
  const [chips, setChips] = useState<Chips>(emptyChips);
  const [mvOp, setMvOp] = useState<MvOp>('<=');
  const [mvText, setMvText] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    () => window.innerHeight >= ROOMY_HEIGHT
  );
  const [recent] = useState(recentQueries);
  const queryBox = useRef<HTMLInputElement>(null);
  const lastQuery = useRef('');

  const hideOrder = zone === 'library';
  const all = useMemo(() => cards ?? [], [cards]);
  const facts = useCardFacts(
    all.flatMap((card) => (card.ref?.id ? [card.ref.id] : []))
  );

  useEffect(() => {
    lastQuery.current = query;
  }, [query]);
  useEffect(() => () => rememberQuery(lastQuery.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || isField(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      queryBox.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const parsed = useMemo(() => parseQuery(query), [query]);
  const mv: Chips['mv'] = /^\d+$/.test(mvText.trim())
    ? { op: mvOp, value: Number(mvText) }
    : null;
  const activeChips = { ...chips, mv };
  const node = allOf(parsed.node, chipsToQuery(activeChips));

  const matches = (card: CardView) =>
    node === null ||
    (card.ref !== null &&
      !card.faceDown &&
      matchesQuery(node, toSearchable(card.ref, facts(card.ref.id))));

  const matching = all.filter(matches);
  const matchingIds = new Set(matching.map((card) => card.instanceId));
  const sort = hideOrder && view.sort === 'newest' ? 'name' : view.sort;
  const groups = organize(showAll ? all : matching, facts, {
    sort,
    group: view.group,
    stack: view.stack,
    hideOrder,
  });

  // Each chip counts what it would match (any face), not the single
  // bucket a card groups under, so an artifact creature counts for both.
  const searchables = all.flatMap((card) =>
    card.ref && !card.faceDown
      ? [toSearchable(card.ref, facts(card.ref.id))]
      : []
  );
  const countOf = (type: ChipType) => {
    const chip = chipsToQuery({ ...emptyChips, types: [type] });
    return searchables.filter((card) => matchesQuery(chip, card)).length;
  };
  const shownTypes = CHIP_TYPES.filter(
    (type) => countOf(type) > 0 || chips.types.includes(type)
  );
  const subtypes = subtypesOf(all.flatMap((card) => card.ref?.typeLine ?? []));

  const pickedSet = new Set(picked);
  const pickedIn = (stack: CardStack) =>
    picked.filter((id) => stack.cards.some((c) => c.instanceId === id));

  const pick =
    onPickedChange &&
    ((stack: CardStack) => {
      const next = stack.cards.find((c) => !pickedSet.has(c.instanceId));
      if (next) {
        onPickedChange([...picked, next.instanceId]);
      } else {
        const ids = new Set(stack.cards.map((c) => c.instanceId));
        onPickedChange(picked.filter((id) => !ids.has(id)));
      }
    });

  const unpick =
    onPickedChange &&
    ((stack: CardStack) => {
      const last = pickedIn(stack).at(-1);
      onPickedChange(picked.filter((id) => id !== last));
    });

  const toggleType = (type: ChipType) =>
    setChips((current) => ({
      ...current,
      types: current.types.includes(type)
        ? current.types.filter((t) => t !== type)
        : [...current.types, type],
    }));

  const toggleColor = (color: Color) =>
    setChips((current) => ({
      ...current,
      colorless: false,
      colors: current.colors.includes(color)
        ? current.colors.filter((c) => c !== color)
        : [...current.colors, color],
    }));

  const clear = () => {
    setQuery('');
    setChips(emptyChips);
    setMvText('');
    queryBox.current?.focus();
  };

  const filterCount = chipCount(activeChips);
  const sorts = BROWSER_SORTS.filter((s) => !(hideOrder && s === 'newest'));
  const presets = hideOrder ? LIBRARY_PRESETS : [];
  const List = view.layout === 'grid' ? 'div' : 'ul';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          ref={queryBox}
          type="search"
          autoFocus
          aria-label={label}
          placeholder="Name, type or text, or t:creature mv<=3"
          className={`${control} min-w-48 flex-1`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {(presets.length > 0 || recent.length > 0) && (
          <select
            aria-label="Presets"
            className={select}
            value=""
            onChange={(e) => {
              if (e.target.value) setQuery(e.target.value);
            }}
          >
            <option value="">Presets…</option>
            {presets.length > 0 && (
              <optgroup label="Presets">
                {presets.map((preset) => (
                  <option key={preset.label} value={preset.query}>
                    {preset.label}
                  </option>
                ))}
              </optgroup>
            )}
            {recent.length > 0 && (
              <optgroup label="Recent">
                {recent.map((text) => (
                  <option key={text} value={text}>
                    {text}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        <span data-testid="browser-count" className="tabular-nums">
          {matching.length} of {all.length}
        </span>
        <button
          type="button"
          className={control}
          disabled={query === '' && filterCount === 0}
          onClick={clear}
        >
          Clear
        </button>
        <button
          type="button"
          aria-expanded={filtersOpen}
          className={pressed(filtersOpen)}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          Filters{filterCount > 0 ? ` (${filterCount})` : ''}
        </button>
        <span className="flex" role="group" aria-label="Layout">
          {(['grid', 'list'] as const).map((layout) => (
            <button
              key={layout}
              type="button"
              aria-pressed={view.layout === layout}
              disabled={!viewLoaded}
              className={classNames(
                pressed(view.layout === layout),
                layout === 'grid' ? 'rounded-r-none' : 'rounded-l-none'
              )}
              onClick={() => setView({ layout })}
            >
              {layout === 'grid' ? 'Grid' : 'List'}
            </button>
          ))}
        </span>
        <select
          aria-label="Sort"
          disabled={!viewLoaded}
          className={select}
          value={sort}
          onChange={(e) => setView({ sort: e.target.value as BrowserSort })}
        >
          {sorts.map((value) => (
            <option key={value} value={value}>
              {SORT_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          aria-label="Group"
          disabled={!viewLoaded}
          className={select}
          value={view.group}
          onChange={(e) => setView({ group: e.target.value as BrowserGroup })}
        >
          {BROWSER_GROUPS.map((value) => (
            <option key={value} value={value}>
              {GROUP_LABELS[value]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={view.stack}
            disabled={!viewLoaded}
            onChange={(e) => setView({ stack: e.target.checked })}
          />
          Stack copies
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show all
        </label>
        {actions}
      </div>

      {filtersOpen && (
        <div
          data-testid="browser-filters"
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <span
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="Types"
          >
            {shownTypes.map((type) => (
              <button
                key={type}
                type="button"
                aria-label={type}
                aria-pressed={chips.types.includes(type)}
                className={pressed(chips.types.includes(type))}
                onClick={() => toggleType(type)}
              >
                {type} <span className="opacity-70">{countOf(type)}</span>
              </button>
            ))}
          </span>
          {subtypes.length > 0 && (
            <select
              aria-label="Subtype"
              className={select}
              value={chips.subtype}
              onChange={(e) =>
                setChips((current) => ({ ...current, subtype: e.target.value }))
              }
            >
              <option value="">Any subtype</option>
              {subtypes.map((subtype) => (
                <option key={subtype} value={subtype}>
                  {subtype}
                </option>
              ))}
            </select>
          )}
          <span className="flex items-center gap-1">
            MV
            <select
              aria-label="Mana value comparison"
              className={select}
              value={mvOp}
              onChange={(e) => setMvOp(e.target.value as MvOp)}
            >
              <option value="<=">≤</option>
              <option value="=">=</option>
              <option value=">=">≥</option>
            </select>
            <input
              type="number"
              aria-label="Mana value"
              min={0}
              className={`${control} w-16`}
              value={mvText}
              onChange={(e) => setMvText(e.target.value)}
            />
          </span>
          <span className="flex gap-1" role="group" aria-label="Colours">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={COLOR_NAMES[color]}
                aria-pressed={chips.colors.includes(color)}
                className={classNames(
                  'h-7 w-7 rounded-full text-xs font-bold ring-1 ring-slate-500',
                  COLOR_STYLES[color],
                  chips.colors.includes(color)
                    ? 'ring-4 ring-sky-500'
                    : 'opacity-60'
                )}
                onClick={() => toggleColor(color)}
              >
                {color}
              </button>
            ))}
            <button
              type="button"
              aria-label="Colourless"
              aria-pressed={chips.colorless}
              className={classNames(
                'h-7 w-7 rounded-full text-xs font-bold ring-1 ring-slate-500',
                COLOR_STYLES.C,
                chips.colorless ? 'ring-4 ring-sky-500' : 'opacity-60'
              )}
              onClick={() =>
                setChips((current) => ({
                  ...current,
                  colors: [],
                  colorless: !current.colorless,
                }))
              }
            >
              C
            </button>
          </span>
          <select
            aria-label="Colour match"
            className={select}
            value={chips.colorMode}
            disabled={chips.colorless}
            onChange={(e) =>
              setChips((current) => ({
                ...current,
                colorMode: e.target.value as ColorMode,
              }))
            }
          >
            <option value="includes">Including</option>
            <option value="exactly">Exactly</option>
            <option value="atMost">At most</option>
          </select>
        </div>
      )}

      {parsed.errors.length > 0 && (
        <p
          role="alert"
          data-testid="query-error"
          className="text-sm text-red-700"
        >
          {parsed.errors.map((error) => error.message).join('. ')}
        </p>
      )}

      <div
        data-testid={testId}
        data-layout={view.layout}
        className="min-h-0 flex-1 overflow-auto"
      >
        {/* Held back until the saved view is known, so it doesn't flip. */}
        {(viewLoaded ? groups : []).map((group) => (
          <section key={group.key} className="mb-2">
            {view.group !== 'none' && (
              <h3
                data-testid="browser-group"
                className="mb-1 text-xs font-semibold tracking-wide text-slate-600 uppercase"
              >
                {group.label} · {group.count}
              </h3>
            )}
            <List
              className={
                view.layout === 'grid'
                  ? 'flex flex-wrap gap-2 p-1 text-center'
                  : 'flex flex-col'
              }
            >
              {group.stacks.map((stack) => {
                const first = stack.cards[0]!;
                return (
                  <Tile
                    key={stack.key}
                    stack={stack}
                    layout={view.layout}
                    testId={tileTestId}
                    matching={matchingIds.has(first.instanceId)}
                    pickedIds={pickedIn(stack)}
                    onPick={pick}
                    onUnpick={unpick}
                    menu={menu}
                    mv={first.ref?.id ? facts(first.ref.id)?.mv : undefined}
                  />
                );
              })}
            </List>
          </section>
        ))}
        {cards && all.length === 0 && (
          <p className="text-sm text-slate-600">No cards.</p>
        )}
        {cards && all.length > 0 && matching.length === 0 && !showAll && (
          <p className="text-sm text-slate-600">No matching cards.</p>
        )}
      </div>
    </div>
  );
};

export default CardBrowser;
