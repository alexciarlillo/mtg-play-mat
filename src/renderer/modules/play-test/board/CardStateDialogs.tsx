import {
  becomesCreature,
  type CardView,
  keywordAbilities,
  MAX_ABILITIES,
  MAX_ABILITY_LENGTH,
  MAX_PT,
} from '@shared/game';
import classNames from 'classnames';
import { type FormEvent, useState } from 'react';

import { basePowerToughness } from '../../../ui/cardStats';
import { Modal } from '../common/Dialogs';
import { setCardState } from './battlefieldMenu';

const input = 'w-20 rounded px-2 py-1 text-lg ring-1 ring-slate-400';
const button =
  'rounded px-3 py-1 text-sm font-medium disabled:opacity-40 ring-1 ring-slate-400';

const whose = (cards: CardView[]) =>
  cards.length === 1
    ? (cards[0].ref?.name ?? 'Face-down card')
    : `${cards.length} permanents`;

const isWhole = (text: string) => {
  const n = Number(text);
  return text.trim() !== '' && Number.isInteger(n) && Math.abs(n) <= MAX_PT;
};

// Sets base power and toughness; counters still count on top. For a
// permanent that isn't a creature, this is it becoming one.
export const PowerToughnessDialog = ({
  cards,
  onClose,
}: {
  cards: CardView[];
  onClose(): void;
}) => {
  const start = basePowerToughness(cards[0]);
  const [power, setPower] = useState(String(start.power));
  const [toughness, setToughness] = useState(String(start.toughness));
  const valid = isWhole(power) && isWhole(toughness);
  const becomes = becomesCreature(cards);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setCardState(cards, {
      ptOverride: { power: Number(power), toughness: Number(toughness) },
    });
    onClose();
  };

  return (
    <Modal
      title={becomes ? 'Becomes a creature' : 'Set base power and toughness'}
      onClose={onClose}
    >
      <form
        onSubmit={submit}
        className="flex flex-col gap-3 text-sm"
        data-testid="pt-dialog"
      >
        <p className="text-slate-600">
          {whose(cards)}. Counters still apply on top.
        </p>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            Power
            <input
              type="number"
              autoFocus
              aria-label="Power"
              className={input}
              value={power}
              onChange={(e) => setPower(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <span className="pb-2 text-lg font-bold">/</span>
          <label className="flex flex-col gap-1">
            Toughness
            <input
              type="number"
              aria-label="Toughness"
              className={input}
              value={toughness}
              onChange={(e) => setToughness(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={button} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={`${button} bg-slate-800 text-white`}
            disabled={!valid}
          >
            OK
          </button>
        </div>
      </form>
    </Modal>
  );
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const has = (card: CardView, ability: string) =>
  (card.abilities ?? []).some((own) => same(own, ability));

// Keyword badges, goaded and anything typed in, for one permanent or a
// selection. A keyword some of a selection has starts as mixed and is
// left alone unless clicked.
export const AbilitiesDialog = ({
  cards,
  onClose,
}: {
  cards: CardView[];
  onClose(): void;
}) => {
  const typed = cards
    .flatMap((card) => card.abilities ?? [])
    .filter(
      (ability) =>
        !(keywordAbilities as readonly string[]).some((k) => same(k, ability))
    )
    .filter((ability, i, all) => all.findIndex((a) => same(a, ability)) === i);
  const known = [...keywordAbilities, ...typed];
  const startOf = (ability: string): boolean | null => {
    const count = cards.filter((card) => has(card, ability)).length;
    if (count === 0) return false;
    return count === cards.length ? true : null;
  };
  const [extra, setExtra] = useState<string[]>([]);
  const [wanted, setWanted] = useState<Record<string, boolean>>({});
  const [text, setText] = useState('');
  const all = [...known, ...extra];
  const stateOf = (ability: string) =>
    ability in wanted ? wanted[ability] : startOf(ability);

  const toggle = (ability: string) =>
    setWanted((now) => ({ ...now, [ability]: stateOf(ability) !== true }));

  const addTyped = () => {
    const name = text.trim();
    if (name.length === 0) return;
    const existing = all.find((a) => same(a, name));
    if (existing) {
      setWanted((now) => ({ ...now, [existing]: true }));
    } else {
      setExtra((now) => [...now, name]);
      setWanted((now) => ({ ...now, [name]: true }));
    }
    setText('');
  };

  const add = all.filter(
    (ability) =>
      ability in wanted && wanted[ability] && startOf(ability) !== true
  );
  const remove = all.filter(
    (ability) =>
      ability in wanted && !wanted[ability] && startOf(ability) !== false
  );
  const tooMany = cards.some(
    (card) =>
      (card.abilities ?? []).filter((a) => !remove.some((r) => same(r, a)))
        .length +
        add.filter((a) => !has(card, a)).length >
      MAX_ABILITIES
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (add.length + remove.length === 0 || tooMany) return;
    setCardState(cards, {
      ...(add.length > 0 && { addAbilities: add }),
      ...(remove.length > 0 && { removeAbilities: remove }),
    });
    onClose();
  };

  return (
    <Modal title="Abilities" onClose={onClose}>
      <form
        onSubmit={submit}
        className="flex max-w-md flex-col gap-3 text-sm"
        data-testid="abilities-dialog"
      >
        <p className="text-slate-600">{whose(cards)}</p>
        <div className="flex flex-wrap gap-1">
          {all.map((ability) => {
            const on = stateOf(ability);
            return (
              <button
                key={ability}
                type="button"
                aria-pressed={on === null ? 'mixed' : on}
                className={classNames(
                  'rounded-full px-2 py-0.5 ring-1',
                  on === true && 'bg-indigo-700 text-white ring-indigo-700',
                  on === null && 'bg-indigo-100 ring-indigo-400',
                  on === false && 'ring-slate-400 hover:bg-slate-100'
                )}
                onClick={() => toggle(ability)}
              >
                {ability}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input
            aria-label="Other ability"
            className="flex-1 rounded px-2 py-1 ring-1 ring-slate-400"
            placeholder="Other, e.g. protection from red"
            maxLength={MAX_ABILITY_LENGTH}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTyped();
              }
            }}
          />
          <button
            type="button"
            className={button}
            disabled={text.trim().length === 0}
            onClick={addTyped}
          >
            Add
          </button>
        </div>
        {tooMany && (
          <p role="alert" className="text-rose-700">
            A permanent can show at most {MAX_ABILITIES} abilities.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={button} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={`${button} bg-slate-800 text-white`}
            disabled={add.length + remove.length === 0 || tooMany}
          >
            Apply
          </button>
        </div>
      </form>
    </Modal>
  );
};
