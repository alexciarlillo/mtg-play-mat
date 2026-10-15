import { type CardRef, describeSeen, type SeenEntry } from '@shared/game';
import { useEffect, useState } from 'react';

import { useCardPreview } from '../../../ui/CardPreview';
import { shownCard } from './shownCard';

const ALL = '';

const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// A card's name that shows the card itself while hovered.
export const CardPill = ({
  card,
  previewKey,
  muted = false,
}: {
  card: CardRef;
  previewKey: string;
  muted?: boolean;
}) => {
  const preview = useCardPreview();
  const view = shownCard(card, previewKey);
  const { instanceId } = view;
  // A pill that goes away while hovered never gets mouseleave.
  useEffect(() => () => preview.hide(instanceId), [preview, instanceId]);
  return (
    <span
      data-testid="card-pill"
      data-card-name={card.name}
      className={
        muted
          ? 'max-w-40 truncate rounded bg-slate-300 px-1.5 text-xs font-medium text-slate-800 italic'
          : 'max-w-40 truncate rounded bg-white px-1.5 text-xs font-medium text-slate-900'
      }
      title={muted ? 'In a random order' : undefined}
      onMouseEnter={(e) => preview.show(view, e.clientX)}
      onMouseLeave={() => preview.hide(instanceId)}
    >
      {card.name}
    </span>
  );
};

// Other players' cards seen this game, newest first, with a choice of
// whose to list once there is more than one player.
const SeenEntries = ({
  entries,
  empty,
  testId,
}: {
  entries: SeenEntry[];
  empty: string;
  testId: string;
}) => {
  const [player, setPlayer] = useState(ALL);
  const players = [
    ...new Map(entries.map((e) => [e.player, e.playerName])).entries(),
  ];
  // A player no longer listed falls back to everyone.
  const chosen = players.some(([id]) => id === player) ? player : ALL;
  const shown = entries
    .filter((entry) => chosen === ALL || entry.player === chosen)
    .reverse();
  return (
    <div className="flex min-h-0 flex-col gap-1">
      {players.length > 1 && (
        <select
          aria-label="Whose cards"
          className="self-start rounded bg-slate-700 px-1 text-xs text-white"
          value={chosen}
          onChange={(e) => setPlayer(e.target.value)}
        >
          <option value={ALL}>Everyone</option>
          {players.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      )}
      <ol
        data-testid={testId}
        className="flex flex-col gap-1 overflow-y-auto pr-1 text-sm"
      >
        {shown.length === 0 && <li className="text-slate-500">{empty}</li>}
        {shown.map((entry) => (
          <li
            key={entry.id}
            data-testid="seen-entry"
            data-by={entry.playerName}
            data-source={entry.source}
            className="flex flex-col gap-0.5"
          >
            <span>
              <time
                dateTime={new Date(entry.at).toISOString()}
                className="text-xs text-slate-500 tabular-nums"
              >
                {time(entry.at)}
              </time>{' '}
              <span className="font-semibold text-sky-200">
                {entry.playerName}
              </span>{' '}
              <span className="text-slate-200">{describeSeen(entry)}</span>
            </span>
            <span className="flex flex-wrap gap-1">
              {entry.cards.map((card, i) => (
                <CardPill
                  key={i}
                  card={card}
                  previewKey={`seen-${entry.id}-${i}`}
                />
              ))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default SeenEntries;
