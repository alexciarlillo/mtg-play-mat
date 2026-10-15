import type { CardView, PlayerId, RevealView } from '@shared/game';
import classNames from 'classnames';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import Card from '../../../ui/Card';
import { useCardPreview } from '../../../ui/CardPreview';
import { factsSettled, useCardFacts } from '../common/cardFacts';
import { Modal } from '../common/Dialogs';
import { useLibraryActivity } from '../common/useLibraryActivity';
import { dispatch } from '../viewStore';
import { keepFocusOnClick, ownsKey } from './dialogKeys';
import {
  finishAction,
  type HitDestination,
  hitDestinations,
  matcher,
  parseStop,
  type RestDestination,
  restDestinations,
  revealCap,
  revealUntilTarget,
  type StopFilter,
  stopFilters,
} from './revealUntil';
import { useLibrary } from './useLibrary';

// Below this the cards show as names, as in the look dialog.
const ROOMY_HEIGHT = 600;

const button =
  'rounded px-3 py-1 text-sm font-medium ring-1 ring-slate-400 disabled:opacity-40';

const toggle = (on: boolean) =>
  classNames(
    'rounded px-2 py-0.5 text-sm ring-1',
    on
      ? 'bg-slate-800 text-white ring-slate-800'
      : 'bg-white ring-slate-400 hover:bg-stone-200'
  );

const Kbd = ({ children }: { children: string }) => (
  <kbd className="rounded bg-white px-1 font-mono text-xs text-slate-700 ring-1 ring-slate-300">
    {children}
  </kbd>
);

interface TileProps {
  card: CardView;
  hit: boolean;
  matched: boolean;
  roomy: boolean;
  onClick(): void;
}

const RevealedTile = ({ card, hit, matched, roomy, onClick }: TileProps) => {
  const preview = useCardPreview();
  const name = card.ref?.name ?? 'Unknown card';
  const { instanceId } = card;
  useEffect(() => () => preview.hide(instanceId), [preview, instanceId]);
  return (
    <button
      type="button"
      data-testid="reveal-until-card"
      data-card-name={card.ref?.name}
      data-hit={hit || undefined}
      data-matched={matched || undefined}
      aria-pressed={hit}
      aria-label={hit ? `${name} (the hit)` : name}
      className={classNames(
        'relative shrink-0 rounded-lg',
        hit && 'outline-3 outline-offset-1 outline-amber-500'
      )}
      onClick={onClick}
      onMouseEnter={roomy ? undefined : (e) => preview.show(card, e.clientX)}
      onMouseLeave={roomy ? undefined : () => preview.hide(instanceId)}
    >
      {roomy ? (
        <Card card={card} size="xs" />
      ) : (
        <div
          className={classNames(
            'max-w-44 truncate rounded px-2 py-0.5 text-sm font-medium ring-1',
            matched ? 'bg-amber-100 ring-amber-500' : 'bg-white ring-slate-400'
          )}
        >
          {name}
        </div>
      )}
    </button>
  );
};

interface Props {
  playerId: PlayerId;
  seq: number;
  // What the table is shown now; the dialog only ever adds to it.
  revealed: RevealView | null | undefined;
  // From the view, so Space works before the library itself arrives.
  libraryCount: number;
  onClose(): void;
}

// Reveals the top of the library to everyone one card at a time, or up
// to the first card a stop matches (cascade, discover, and the like),
// then puts every revealed card away in one action.
const RevealUntilDialog = ({
  playerId,
  seq,
  revealed,
  libraryCount,
  onClose,
}: Props) => {
  useLibraryActivity({ kind: 'reveal' });
  const library = useLibrary(seq);
  const cards = library ?? [];
  const count =
    revealed?.source === 'libraryTop'
      ? Math.min(revealed.cards.length, libraryCount)
      : 0;
  const shown = cards.slice(0, count);
  const cap = revealCap(libraryCount);

  const [stop, setStop] = useState<StopFilter>('none');
  const [query, setQuery] = useState('');
  const { node, errors } = parseStop(stop, query);
  const facts = useCardFacts(cards.flatMap((card) => card.ref?.id ?? []));
  const matches = matcher(node, facts);
  // Stopping early on a card whose rules text hasn't arrived would be
  // wrong, so a stop waits for every card's facts.
  const settled = cards.every((card) => factsSettled(card.ref?.id ?? ''));

  // undefined: the first match (or, with no stop, the latest card);
  // null: no hit at all, so every card goes with the rest. A chosen card
  // that is no longer shown (an undo) falls back to the automatic hit.
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const firstMatch = shown.find(matches);
  const autoHit = node ? firstMatch : shown.at(-1);
  const chosenShown =
    typeof chosen === 'string' && shown.some((c) => c.instanceId === chosen);
  let hitId: string | null = autoHit?.instanceId ?? null;
  if (chosen === null) hitId = null;
  else if (chosenShown) hitId = chosen;
  const hit = shown.find((card) => card.instanceId === hitId) ?? null;

  const [hitTo, setHitTo] = useState<HitDestination>('hand');
  const [restTo, setRestTo] = useState<RestDestination>('bottom');
  const [roomy] = useState(() => window.innerHeight >= ROOMY_HEIGHT);
  const body = useRef<HTMLDivElement>(null);

  const canReveal = count < cap;
  const canAuto = canReveal && library !== null && node !== null && settled;

  const revealTo = (target: number) => {
    if (target <= count) return;
    dispatch({ type: 'reveal', playerId, source: 'libraryTop', count: target });
  };
  // Space pressed again before the table has caught up still counts.
  const asked = useRef(count);
  useEffect(() => {
    asked.current = count;
  }, [count]);
  const revealNext = () => {
    const from = Math.max(count, asked.current);
    if (from >= cap) return;
    asked.current = from + 1;
    revealTo(from + 1);
  };
  const revealUntil = () => {
    if (canAuto) revealTo(revealUntilTarget(cards, matches, count));
  };
  const finish = () => {
    if (shown.length === 0) return;
    const ids = shown.map((card) => card.instanceId);
    dispatch(finishAction(playerId, ids, hitId, hitTo, restTo));
    onClose();
  };
  const chooseStop = (next: StopFilter) => {
    setStop(next);
    setChosen(undefined);
  };
  const toggleHit = (card: CardView) =>
    setChosen(card.instanceId === hitId ? null : card.instanceId);

  const onKey = (e: KeyboardEvent) => {
    if (ownsKey(e.target, e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === ' ') {
      e.preventDefault();
      revealNext();
      return;
    }
    if (key === 'enter') {
      e.preventDefault();
      finish();
      return;
    }
    if (key === 'a') {
      revealUntil();
      return;
    }
    const filter = stopFilters[Number(key) - 1];
    if (filter) {
      e.preventDefault();
      chooseStop(filter.id);
      return;
    }
    const to = hitDestinations.find((d) => d.key === key);
    if (to) setHitTo(to.id);
    const rest = restDestinations.find((d) => d.key === key);
    if (rest) setRestTo(rest.id);
  };

  const keyHandler = useRef(onKey);
  useLayoutEffect(() => {
    keyHandler.current = onKey;
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  // Whatever opened the dialog may hold focus, and Space must not
  // press it.
  useEffect(() => body.current?.focus(), []);

  const status = () => {
    if (libraryCount === 0) return 'Your library is empty.';
    if (count === 0) return 'Nothing revealed yet.';
    const of = `Revealed ${count} of ${libraryCount}`;
    if (node && !firstMatch && count >= cap) return `${of}. No hit.`;
    return hit ? `${of}. Hit: ${hit.ref?.name ?? 'a card'}` : `${of}.`;
  };

  return (
    <Modal title="Reveal until…" onClose={onClose} wide column>
      <div
        ref={body}
        tabIndex={-1}
        data-testid="reveal-until"
        data-count={count}
        className="flex min-h-0 flex-1 flex-col gap-2 outline-none"
        onMouseDown={keepFocusOnClick}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold">Stop at</span>
          {stopFilters.map((filter, i) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={stop === filter.id}
              className={toggle(stop === filter.id)}
              onClick={() => chooseStop(filter.id)}
            >
              <Kbd>{String(i + 1)}</Kbd> {filter.label}
            </button>
          ))}
          {stop === 'query' && (
            <input
              autoFocus
              aria-label="Stop at a card matching"
              placeholder="mv<=3 -t:land"
              className="w-48 rounded bg-white px-2 py-0.5 ring-1 ring-slate-400"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setChosen(undefined);
              }}
              onKeyDown={(e) => {
                // Back to the dialog's keys, so A reveals right away.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  body.current?.focus();
                }
              }}
            />
          )}
        </div>
        {errors.length > 0 && (
          <p
            role="alert"
            data-testid="reveal-query-error"
            className="text-xs text-red-700"
          >
            {errors[0]!.message}
          </p>
        )}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${button} bg-slate-800 text-white`}
            disabled={!canReveal}
            onClick={revealNext}
          >
            Reveal next <Kbd>Space</Kbd>
          </button>
          <button
            type="button"
            className={button}
            disabled={!canAuto}
            onClick={revealUntil}
          >
            Reveal until a hit <Kbd>A</Kbd>
          </button>
          <span data-testid="reveal-until-status" className="text-sm">
            {status()}
          </span>
        </div>
        <div
          data-testid="reveal-until-cards"
          className="flex min-h-8 flex-wrap gap-1 overflow-y-auto"
        >
          {shown.map((card) => (
            <RevealedTile
              key={card.instanceId}
              card={card}
              hit={card.instanceId === hitId}
              matched={matches(card)}
              roomy={roomy}
              onClick={() => toggleHit(card)}
            />
          ))}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold">Hit to</span>
          {hitDestinations.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={hitTo === d.id}
              className={toggle(hitTo === d.id)}
              onClick={() => setHitTo(d.id)}
            >
              <Kbd>{d.key.toUpperCase()}</Kbd> {d.label}
            </button>
          ))}
          <span className="font-semibold">The rest to</span>
          {restDestinations.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={restTo === d.id}
              className={toggle(restTo === d.id)}
              onClick={() => setRestTo(d.id)}
            >
              <Kbd>{d.key.toUpperCase()}</Kbd> {d.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-600">
            Click a card to make it the hit, or click the hit for none. Closing
            leaves the cards revealed.
          </span>
          <button type="button" className={button} onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className={`${button} bg-slate-800 text-white`}
            disabled={shown.length === 0}
            onClick={finish}
          >
            Finish <Kbd>Enter</Kbd>
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default RevealUntilDialog;
