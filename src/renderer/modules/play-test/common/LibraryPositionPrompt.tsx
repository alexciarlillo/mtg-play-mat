import type { CardView } from '@shared/game';

import { moveTo } from './cardMenus';
import { NumberPrompt } from './Dialogs';

interface Props {
  card: CardView;
  // Cards in the library now, not counting the one being put in.
  libraryCount: number;
  onClose(): void;
}

// 1 is the top. A number past the end puts the card on the bottom rather
// than being refused, since the library may have shrunk meanwhile.
const LibraryPositionPrompt = ({ card, libraryCount, onClose }: Props) => (
  <NumberPrompt
    title="Put into library"
    label={`Position from the top (1 = top, ${libraryCount + 1} = bottom)`}
    initial={Math.min(3, libraryCount + 1)}
    min={1}
    onSubmit={(position) =>
      moveTo(card, 'library', Math.min(position, libraryCount + 1) - 1)
    }
    onClose={onClose}
  />
);

export default LibraryPositionPrompt;
