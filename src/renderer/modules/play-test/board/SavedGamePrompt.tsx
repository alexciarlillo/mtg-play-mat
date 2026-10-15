import type { SavedGameOffer } from '@shared/types/playTest';

import { Modal } from '../common/Dialogs';

const logError = (err: unknown) => {
  console.error('[play-test] saved game request failed', err);
};

const button =
  'rounded px-3 py-1 text-sm font-medium ring-1 ring-slate-400 disabled:opacity-40';

const savedWhen = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

// Asks whether to pick up the deck's saved game or keep the new one, or
// says why the save couldn't be used.
const SavedGamePrompt = ({ offer }: { offer: SavedGameOffer }) => {
  const dismiss = () => {
    window.api.dismissSavedGame().catch(logError);
  };

  if (offer.kind === 'failed') {
    return (
      <Modal title="Saved game not restored" onClose={dismiss}>
        <p data-testid="saved-game-error" className="mb-4 text-sm">
          {offer.message}
        </p>
        <div className="flex justify-end">
          <button type="button" autoFocus className={button} onClick={dismiss}>
            OK
          </button>
        </div>
      </Modal>
    );
  }

  const restore = () => {
    window.api.restoreSavedGame().catch(logError);
  };
  return (
    <Modal title="Restore saved game?" onClose={dismiss}>
      <p className="mb-2 text-sm">
        You have a saved game with {offer.deckName} from{' '}
        {savedWhen(offer.savedAt)}.
      </p>
      <p className="mb-4 text-sm text-slate-600">
        Restore it, or keep the new game. Playing on keeps the new game too.
      </p>
      {offer.refused && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {offer.refused}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={button} onClick={dismiss}>
          New game
        </button>
        <button
          type="button"
          autoFocus
          className={`${button} bg-slate-800 text-white`}
          onClick={restore}
        >
          Restore
        </button>
      </div>
    </Modal>
  );
};

export default SavedGamePrompt;
