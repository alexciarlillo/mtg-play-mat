import {
  Description,
  Dialog,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import {
  type CardNameResult,
  type DeckFormat,
  deckFormats,
  type DeckImportReport,
  type NewDeckCard,
  type UnresolvedImportLine,
} from '@shared/types/decks';
import { useState } from 'react';

import CardSearch from './CardSearch';
import {
  boardLabels,
  buttonClass,
  formatLabels,
  inputClass,
  primaryButtonClass,
} from './deckUi';

interface Props {
  isOpen: boolean;
  onClose(): void;
  onSaved(deckId: number): void;
}

type Fix = { kind: 'skip' } | { kind: 'card'; card: CardNameResult };

const ignoredLabels = {
  maybeboard: 'maybeboard',
  about: 'deck info',
  comment: 'comment',
  zero: 'quantity 0',
};

const UnresolvedRow = ({
  line,
  fix,
  onFix,
}: {
  line: UnresolvedImportLine;
  fix: Fix | undefined;
  onFix(fix: Fix | undefined): void;
}) => (
  <li
    data-testid="unresolved-line"
    className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm"
  >
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="font-mono">
          <span className="text-gray-500">L{line.line}:</span> {line.text}
        </div>
        <div className="text-xs text-amber-800">{line.reason}</div>
      </div>
      {fix ? (
        <button
          type="button"
          className={buttonClass}
          onClick={() => onFix(undefined)}
        >
          Undo
        </button>
      ) : (
        <button
          type="button"
          className={buttonClass}
          onClick={() => onFix({ kind: 'skip' })}
        >
          Skip
        </button>
      )}
    </div>
    {fix?.kind === 'skip' && (
      <div className="mt-1 text-xs text-gray-600">Skipped</div>
    )}
    {fix?.kind === 'card' && (
      <div className="mt-1 text-xs text-green-700">
        Using {line.qty} × {fix.card.name} (
        {fix.card.defaultPrinting.setCode.toUpperCase()})
      </div>
    )}
    {!fix && (
      <div className="mt-2">
        <CardSearch
          label={`Replace line ${line.line}`}
          placeholder="Search for the right card…"
          initialQuery={line.name}
          onPick={(card) => onFix({ kind: 'card', card })}
        />
      </div>
    )}
  </li>
);

const DeckImportModal = ({ isOpen, onClose, onSaved }: Props) => {
  const [deckList, setDeckList] = useState('');
  const [name, setName] = useState('');
  const [report, setReport] = useState<DeckImportReport | null>(null);
  const [format, setFormat] = useState<DeckFormat>('constructed');
  const [fixes, setFixes] = useState<Record<number, Fix>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setDeckList('');
    setName('');
    setReport(null);
    setFixes({});
    setError(null);
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const preview = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.api.previewDeckImport(deckList);
      setReport(result);
      setFormat(result.format);
      setFixes({});
      if (!name.trim() && result.deckName) setName(result.deckName);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const pending = report?.unresolved.filter((u) => !fixes[u.line]) ?? [];
  const cards: NewDeckCard[] = report
    ? [
        ...report.resolved.map((r) => ({
          printingId: r.printing.id,
          qty: r.qty,
          board: r.board,
        })),
        ...report.unresolved.flatMap((u) => {
          const fix = fixes[u.line];
          return fix?.kind === 'card'
            ? [
                {
                  printingId: fix.card.defaultPrinting.id,
                  qty: u.qty,
                  board: u.board,
                },
              ]
            : [];
        }),
      ]
    : [];
  const deckName = name.trim() || report?.deckName || 'Imported deck';
  const cover =
    cards.find((c) => c.board === 'commander') ??
    cards.find((c) => c.board === 'main');

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await window.api.createDeck({
        name: deckName,
        format,
        cards,
        displayPrintingId: cover?.printingId ?? null,
      });
      reset();
      onSaved(id);
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  };

  const counts = (board: string) =>
    cards.filter((c) => c.board === board).reduce((n, c) => n + c.qty, 0);

  return (
    <Dialog open={isOpen} onClose={close} className="relative z-50">
      <div className="fixed inset-0 bg-gray-500/25" aria-hidden="true" />

      <div className="fixed inset-0 z-10 overflow-y-auto p-4 sm:p-6 md:p-12">
        <DialogPanel className="mx-auto max-w-2xl rounded-lg bg-white p-4 shadow-2xl ring-1 ring-black/5">
          <DialogTitle as="h3" className="text-lg font-medium text-gray-900">
            Import deck
          </DialogTitle>

          <div className="mt-2">
            <label
              htmlFor="deck-name"
              className="block text-sm font-medium text-gray-700"
            >
              Name
            </label>
            <input
              id="deck-name"
              type="text"
              className={`mt-1 ${inputClass}`}
              placeholder={report?.deckName ?? 'Imported deck'}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {!report && (
            <>
              <Description className="mt-2 text-sm text-gray-500">
                Paste a deck list: plain text, MTGA, or Moxfield export.
              </Description>
              <label
                htmlFor="deck-list"
                className="mt-2 block text-sm font-medium text-gray-700"
              >
                Card list
              </label>
              <textarea
                id="deck-list"
                rows={14}
                className={`mt-1 font-mono ${inputClass}`}
                value={deckList}
                onChange={(e) => setDeckList(e.target.value)}
              />
            </>
          )}

          {report && (
            <div data-testid="import-report" className="mt-3 space-y-3 text-sm">
              {report.cardDataMissing && (
                <p className="rounded-md bg-red-50 p-2 text-red-800">
                  No card data yet. Wait for the card data download to finish,
                  then check the list again.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <span data-testid="import-summary">
                  {report.resolved.length} resolved, {report.unresolved.length}{' '}
                  unresolved, {report.ignored.length} ignored
                </span>
                <label className="flex items-center gap-1">
                  Format
                  <select
                    aria-label="Format"
                    className="rounded-md border border-gray-300 px-1 py-0.5"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as DeckFormat)}
                  >
                    {deckFormats.map((f) => (
                      <option key={f} value={f}>
                        {formatLabels[f]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="text-gray-600">
                {(['commander', 'main', 'side'] as const)
                  .filter((b) => counts(b) > 0)
                  .map((b) => `${boardLabels[b]}: ${counts(b)}`)
                  .join(' · ')}
              </div>

              {report.notes.length > 0 && (
                <ul className="list-disc pl-5 text-gray-600">
                  {report.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}

              {report.unresolved.length > 0 && (
                <div>
                  <h4 className="font-medium">
                    Unresolved: fix or skip each line
                  </h4>
                  <ul className="mt-1 space-y-2">
                    {report.unresolved.map((line) => (
                      <UnresolvedRow
                        key={line.line}
                        line={line}
                        fix={fixes[line.line]}
                        onFix={(fix) =>
                          setFixes((current) => {
                            const next = { ...current };
                            if (fix) next[line.line] = fix;
                            else delete next[line.line];
                            return next;
                          })
                        }
                      />
                    ))}
                  </ul>
                </div>
              )}

              {report.ignored.length > 0 && (
                <details>
                  <summary className="cursor-pointer font-medium">
                    Ignored lines ({report.ignored.length})
                  </summary>
                  <ul className="mt-1 font-mono text-xs text-gray-600">
                    {report.ignored.map((i) => (
                      <li key={i.line}>
                        L{i.line}: {i.text}{' '}
                        <span className="font-sans">
                          ({ignoredLabels[i.reason]})
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <details>
                <summary className="cursor-pointer font-medium">
                  Resolved lines ({report.resolved.length})
                </summary>
                <ul className="mt-1 max-h-64 overflow-auto text-xs">
                  {report.resolved.map((r) => (
                    <li key={r.line} className="flex justify-between gap-2">
                      <span>
                        {r.qty} {r.printing.name}{' '}
                        <span className="text-gray-500">
                          ({r.printing.setCode.toUpperCase()}{' '}
                          {r.printing.collectorNumber}) · {boardLabels[r.board]}
                        </span>
                      </span>
                      {r.warning && (
                        <span className="text-amber-700">{r.warning}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

          <div className="mt-4 flex justify-between">
            <button type="button" className={buttonClass} onClick={close}>
              Cancel
            </button>
            <div className="flex gap-2">
              {report && (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => setReport(null)}
                >
                  Back
                </button>
              )}
              {report ? (
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={busy || pending.length > 0 || cards.length === 0}
                  title={
                    pending.length > 0
                      ? 'Fix or skip every unresolved line first'
                      : undefined
                  }
                  onClick={() => void save()}
                >
                  Save deck
                </button>
              ) : (
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={busy || deckList.trim() === ''}
                  onClick={() => void preview()}
                >
                  Check list
                </button>
              )}
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default DeckImportModal;
