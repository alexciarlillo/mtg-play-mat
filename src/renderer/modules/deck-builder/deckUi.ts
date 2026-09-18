import type { DeckBoard, DeckFormat } from '@shared/types/decks';

export const boardLabels: Record<DeckBoard, string> = {
  commander: 'Commander',
  main: 'Main',
  side: 'Sideboard',
};

export const formatLabels: Record<DeckFormat, string> = {
  commander: 'Commander',
  constructed: 'Constructed',
  other: 'Other',
};

export const buttonClass =
  'inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 disabled:opacity-40 focus:outline-hidden focus:ring-2 focus:ring-indigo-500';

export const primaryButtonClass =
  'inline-flex items-center gap-1 rounded-md border border-transparent bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-indigo-700 disabled:opacity-40 focus:outline-hidden focus:ring-2 focus:ring-indigo-500';

export const inputClass =
  'block w-full rounded-md border border-gray-300 px-2 py-1 text-sm shadow-xs focus:border-indigo-500 focus:outline-hidden focus:ring-indigo-500';
