import {
  MinusIcon,
  PlusIcon,
  StarIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { typeGroup, typeGroups } from '@shared/decks/cardTypes';
import { exportDeck, type ExportFormat } from '@shared/decks/exportDeck';
import {
  type DeckBoard,
  deckBoards,
  type DeckCard,
  type DeckCardEdit,
  type DeckDetail,
  type DeckFormat,
  deckFormats,
  type DeckPatch,
  type PrintingSummary,
} from '@shared/types/decks';
import classNames from 'classnames';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';

import CardImg from '../../ui/CardImg';
import CardSearch from './CardSearch';
import {
  boardLabels,
  buttonClass,
  formatLabels,
  inputClass,
  primaryButtonClass,
} from './deckUi';
import PrintingPicker from './PrintingPicker';

// The async clipboard API refuses unfocused documents, so fall back to
// the older selection-based copy.
const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
};

const boardOrder: DeckBoard[] = ['commander', 'main', 'side'];

const total = (cards: DeckCard[]) => cards.reduce((n, c) => n + c.qty, 0);

const byName = (a: DeckCard, b: DeckCard) =>
  (a.printing?.name ?? '').localeCompare(b.printing?.name ?? '');

interface RowProps {
  card: DeckCard;
  isCover: boolean;
  onEdit(edit: DeckCardEdit): void;
  onCover(): void;
  onPickPrinting(): void;
  onHover(printing: PrintingSummary | null): void;
}

const CardRow = ({
  card,
  isCover,
  onEdit,
  onCover,
  onPickPrinting,
  onHover,
}: RowProps) => {
  const { printing, printingId, board, qty } = card;
  const name = printing?.name ?? 'Unknown card';
  const setQty = (value: number) =>
    onEdit({ type: 'setQty', printingId, board, qty: value });

  return (
    <li
      data-testid="deck-card"
      data-card-name={name}
      data-board={board}
      className="group flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-gray-50"
      onMouseEnter={() => onHover(printing)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        aria-label={`One fewer ${name}`}
        className="rounded p-0.5 text-gray-500 hover:bg-gray-200"
        onClick={() => setQty(qty - 1)}
      >
        <MinusIcon className="h-3 w-3" />
      </button>
      <input
        type="number"
        min={0}
        max={999}
        aria-label={`Quantity of ${name}`}
        className="w-12 rounded border border-gray-300 px-1 text-right"
        value={qty}
        onChange={(e) => {
          // An emptied field is mid-edit, not a request to remove the card.
          if (e.target.value === '') return;
          const value = Number(e.target.value);
          if (Number.isInteger(value) && value >= 0 && value <= 999) {
            setQty(value);
          }
        }}
      />
      <button
        type="button"
        aria-label={`One more ${name}`}
        className="rounded p-0.5 text-gray-500 hover:bg-gray-200"
        onClick={() => setQty(qty + 1)}
      >
        <PlusIcon className="h-3 w-3" />
      </button>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {printing && (
        <button
          type="button"
          data-testid="printing-button"
          title="Change printing"
          className="flex items-center gap-1 rounded px-1 text-xs text-gray-600 hover:bg-indigo-100"
          onClick={onPickPrinting}
        >
          <i className={`ss ss-${printing.keyruneCode.toLowerCase()}`} />
          {printing.setCode.toUpperCase()} #{printing.collectorNumber}
        </button>
      )}
      <select
        aria-label={`Move ${name}`}
        className="rounded border border-gray-200 text-xs text-gray-600"
        value=""
        onChange={(e) =>
          onEdit({
            type: 'move',
            printingId,
            from: board,
            to: e.target.value as DeckBoard,
          })
        }
      >
        <option value="" disabled>
          Move…
        </option>
        {deckBoards
          .filter((b) => b !== board)
          .map((b) => (
            <option key={b} value={b}>
              {boardLabels[b]}
            </option>
          ))}
      </select>
      <button
        type="button"
        aria-label={`Use ${name} as the deck cover`}
        title="Use as deck cover"
        className={classNames(
          'rounded p-0.5 hover:bg-gray-200',
          isCover ? 'text-amber-500' : 'text-gray-400'
        )}
        onClick={onCover}
      >
        <StarIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        className="rounded p-0.5 text-gray-400 hover:bg-red-100 hover:text-red-700"
        onClick={() => setQty(0)}
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </li>
  );
};

const DeckViewer = () => {
  const { deckId } = useParams();
  const id = Number(deckId);
  const [deck, setDeck] = useState<DeckDetail | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [hovered, setHovered] = useState<PrintingSummary | null>(null);
  const [picking, setPicking] = useState<DeckCard | null>(null);
  const [addBoard, setAddBoard] = useState<DeckBoard>('main');
  const [copied, setCopied] = useState<ExportFormat | null>(null);

  const show = (detail: DeckDetail | null) => {
    setDeck(detail);
    if (detail) setName(detail.name);
  };

  useEffect(() => {
    let cancelled = false;
    void window.api.getDeck(id).then((detail) => {
      if (!cancelled) show(detail);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (deck === undefined) return <p>Loading…</p>;
  if (deck === null) return <p>Deck not found.</p>;

  const edit = (change: DeckCardEdit) =>
    void window.api.editDeckCards(deck.id, change).then(show);
  const update = (patch: DeckPatch) =>
    void window.api.updateDeck(deck.id, patch).then(show);

  const rename = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== deck.name) update({ name: trimmed });
    else setName(deck.name);
  };

  const copy = async (format: ExportFormat) => {
    await copyText(exportDeck(deck.cards, format));
    setCopied(format);
    setTimeout(() => setCopied(null), 1500);
  };

  const cover = deck.displayPrintingId;
  const preview = hovered?.id ?? cover ?? undefined;

  return (
    <div className="flex h-full w-full gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 pb-3">
          <div className="min-w-64 flex-1">
            <label htmlFor="deck-title" className="text-xs text-gray-500">
              Deck name
            </label>
            <input
              id="deck-title"
              className={`${inputClass} text-lg font-semibold`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={rename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          </div>
          <label className="text-xs text-gray-500">
            Format
            <select
              aria-label="Format"
              className="block rounded-md border border-gray-300 px-1 py-1 text-sm text-gray-900"
              value={deck.format}
              onChange={(e) => update({ format: e.target.value as DeckFormat })}
            >
              {deckFormats.map((f) => (
                <option key={f} value={f}>
                  {formatLabels[f]}
                </option>
              ))}
            </select>
          </label>
          <span data-testid="deck-count" className="pb-1 text-sm text-gray-600">
            {deck.cardCount} cards
          </span>
          <button
            type="button"
            className={buttonClass}
            onClick={() => void copy('mtga')}
          >
            {copied === 'mtga' ? 'Copied!' : 'Copy MTGA'}
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => void copy('moxfield')}
          >
            {copied === 'moxfield' ? 'Copied!' : 'Copy Moxfield'}
          </button>
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => void window.api.startPlayTest(deck.id)}
          >
            Play test
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1">
            <CardSearch
              label="Add card"
              placeholder="Add a card by name…"
              onPick={(card) =>
                edit({
                  type: 'add',
                  printingId: card.defaultPrinting.id,
                  board: addBoard,
                  qty: 1,
                })
              }
            />
          </div>
          <select
            aria-label="Add to board"
            className="rounded-md border border-gray-300 px-1 py-1 text-sm"
            value={addBoard}
            onChange={(e) => setAddBoard(e.target.value as DeckBoard)}
          >
            {deckBoards.map((b) => (
              <option key={b} value={b}>
                to {boardLabels[b]}
              </option>
            ))}
          </select>
        </div>

        {boardOrder.map((board) => {
          const cards = deck.cards.filter((c) => c.board === board);
          if (cards.length === 0) return null;
          return (
            <section
              key={board}
              data-testid={`board-${board}`}
              className="mt-4"
            >
              <h3 className="text-base font-semibold">
                {boardLabels[board]} ({total(cards)})
              </h3>
              <div className="columns-1 gap-6 xl:columns-2">
                {typeGroups.map((group) => {
                  const inGroup = cards
                    .filter((c) => typeGroup(c.printing?.typeLine) === group)
                    .sort(byName);
                  if (inGroup.length === 0) return null;
                  return (
                    <div key={group} className="mt-2 break-inside-avoid">
                      <h4 className="text-xs font-medium uppercase text-gray-500">
                        {group} ({total(inGroup)})
                      </h4>
                      <ul>
                        {inGroup.map((card) => (
                          <CardRow
                            key={`${card.board}:${card.printingId}`}
                            card={card}
                            isCover={card.printingId === cover}
                            onEdit={edit}
                            onCover={() =>
                              update({ displayPrintingId: card.printingId })
                            }
                            onPickPrinting={() => setPicking(card)}
                            onHover={setHovered}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <aside className="sticky top-0 hidden w-64 shrink-0 self-start md:block">
        <div className="aspect-card" data-testid="deck-preview">
          <CardImg scryfallId={preview} name={hovered?.name ?? deck.name} />
        </div>
      </aside>

      {picking?.printing && (
        <PrintingPicker
          current={picking.printing}
          onClose={() => setPicking(null)}
          onPick={(printing) => {
            if (printing.id !== picking.printingId) {
              edit({
                type: 'setPrinting',
                printingId: picking.printingId,
                board: picking.board,
                newPrintingId: printing.id,
              });
            }
            setPicking(null);
          }}
        />
      )}
    </div>
  );
};

export default DeckViewer;
