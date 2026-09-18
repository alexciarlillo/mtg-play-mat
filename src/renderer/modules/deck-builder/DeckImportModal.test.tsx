import type {
  CardNameResult,
  DeckImportReport,
  PrintingSummary,
} from '@shared/types/decks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DeckImportModal from './DeckImportModal';

const printing = (id: string, name: string): PrintingSummary => ({
  id,
  oracleId: null,
  name,
  layout: 'normal',
  typeLine: 'Instant',
  manaCost: null,
  cmc: null,
  setCode: 'm10',
  setName: 'Magic 2010',
  collectorNumber: '1',
  keyruneCode: 'm10',
  releasedAt: null,
  lang: 'en',
  digital: false,
  promo: false,
});

const report: DeckImportReport = {
  deckName: 'From About',
  format: 'constructed',
  resolved: [
    {
      line: 1,
      text: '4 Lightning Bolt',
      qty: 4,
      board: 'main',
      printing: printing('bolt', 'Lightning Bolt'),
      matchedBy: 'name',
    },
  ],
  unresolved: [
    {
      line: 2,
      text: '2 Lightnig Helix',
      qty: 2,
      board: 'side',
      name: 'Lightnig Helix',
      reason: 'No card named "Lightnig Helix"',
    },
  ],
  ignored: [],
  notes: [],
  cardDataMissing: false,
};

const helix: CardNameResult = {
  oracleId: null,
  name: 'Lightning Helix',
  typeLine: 'Instant',
  defaultPrinting: printing('helix', 'Lightning Helix'),
};

const api = {
  previewDeckImport: vi.fn(async () => report),
  searchCardNames: vi.fn(async () => [helix]),
  createDeck: vi.fn(async () => 5),
};

beforeEach(() => {
  vi.stubGlobal('api', api);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('DeckImportModal', () => {
  it('saves only once unresolved lines are fixed, using the fix', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<DeckImportModal isOpen onClose={() => {}} onSaved={onSaved} />);

    await user.type(screen.getByLabelText('Card list'), 'anything');
    await user.click(screen.getByRole('button', { name: 'Check list' }));
    expect(await screen.findByLabelText('Name')).toHaveValue('From About');

    const save = screen.getByRole('button', { name: 'Save deck' });
    expect(save).toBeDisabled();

    await user.click(screen.getByLabelText('Replace line 2'));
    await user.click(
      await screen.findByRole('option', { name: /Lightning Helix/ })
    );
    expect(screen.getByText(/Using 2 × Lightning Helix/)).toBeInTheDocument();
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(5));
    expect(api.createDeck).toHaveBeenCalledWith({
      name: 'From About',
      format: 'constructed',
      cards: [
        { printingId: 'bolt', qty: 4, board: 'main' },
        { printingId: 'helix', qty: 2, board: 'side' },
      ],
      displayPrintingId: 'bolt',
    });
  });
});
