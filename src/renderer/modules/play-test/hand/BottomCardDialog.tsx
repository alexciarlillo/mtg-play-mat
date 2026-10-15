import Card from '../../../ui/Card';
import { Modal } from '../common/Dialogs';
import { useLibraryActivity } from '../common/useLibraryActivity';
import { useLibrary } from './useLibrary';

interface Props {
  seq: number;
  onClose(): void;
}

// A private peek at the bottom card. It follows the library as it
// changes, so it never shows a card that has since moved.
const BottomCardDialog = ({ seq, onClose }: Props) => {
  // The table has no words for a bottom peek yet, only "in their library".
  useLibraryActivity({ kind: 'other' });
  const library = useLibrary(seq);
  const bottom = library?.at(-1);
  return (
    <Modal title="Bottom of your library" onClose={onClose}>
      <div data-testid="bottom-card" className="flex justify-center">
        {library && !bottom && (
          <p className="text-sm text-slate-600">Your library is empty.</p>
        )}
        {bottom && <Card card={bottom} size="sm" />}
      </div>
    </Modal>
  );
};

export default BottomCardDialog;
