import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import type { PrintingSummary } from '@shared/types/decks';
import classNames from 'classnames';
import { useEffect, useState } from 'react';

import CardImg from '../../ui/CardImg';
import { buttonClass } from './deckUi';

interface Props {
  current: PrintingSummary;
  onPick(printing: PrintingSummary): void;
  onClose(): void;
}

// Every printing of one card, newest first, to swap a deck card's art.
const PrintingPicker = ({ current, onPick, onClose }: Props) => {
  const [printings, setPrintings] = useState<PrintingSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.api.listPrintings(current.id).then((found) => {
      if (!cancelled) setPrintings(found);
    });
    return () => {
      cancelled = true;
    };
  }, [current.id]);

  return (
    <Dialog open onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-gray-500/25" aria-hidden="true" />
      <div className="fixed inset-0 z-10 overflow-y-auto p-4 md:p-10">
        <DialogPanel className="mx-auto max-w-5xl rounded-lg bg-white p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <DialogTitle as="h3" className="text-lg font-medium">
              Printings of {current.name}
            </DialogTitle>
            <button type="button" className={buttonClass} onClick={onClose}>
              Close
            </button>
          </div>
          {printings === null && <p className="mt-3 text-sm">Loading…</p>}
          <ul
            data-testid="printing-picker"
            className="mt-3 grid grid-cols-[repeat(auto-fill,10rem)] gap-4"
          >
            {printings?.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  data-testid="printing-option"
                  data-printing-id={p.id}
                  aria-label={`${p.setName} #${p.collectorNumber}`}
                  aria-current={p.id === current.id}
                  className={classNames(
                    'w-40 rounded-lg p-1 text-left hover:bg-indigo-50',
                    p.id === current.id && 'ring-2 ring-indigo-500'
                  )}
                  onClick={() => onPick(p)}
                >
                  <div className="aspect-card">
                    <CardImg scryfallId={p.id} name={p.name} />
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs">
                    <i className={`ss ss-${p.keyruneCode.toLowerCase()}`} />
                    <span className="font-medium">
                      {p.setCode.toUpperCase()} #{p.collectorNumber}
                    </span>
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {p.setName}
                    {p.lang !== 'en' && ` · ${p.lang}`}
                    {p.digital && ' · digital'}
                    {p.promo && ' · promo'}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default PrintingPicker;
