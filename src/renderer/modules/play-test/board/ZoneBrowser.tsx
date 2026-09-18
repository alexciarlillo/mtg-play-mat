import type { CardView } from '@shared/game';

import Card from '../../../ui/Card';
import { moveMenu } from '../common/cardMenus';
import { Modal } from '../common/Dialogs';

interface Props {
  title: string;
  cards: CardView[];
  onClose(): void;
  readOnly?: boolean;
}

// Every card in a public zone, newest first, each with the move menu
// unless it belongs to an opponent.
const ZoneBrowser = ({ title, cards, onClose, readOnly = false }: Props) => (
  <Modal title={`${title} (${cards.length})`} onClose={onClose} wide>
    {cards.length === 0 ? (
      <p className="text-sm text-slate-600">No cards.</p>
    ) : (
      <div
        data-testid="zone-browser"
        className="flex flex-wrap gap-3 text-center"
      >
        {[...cards].reverse().map((card) => (
          <Card
            key={card.instanceId}
            card={card}
            size="sm"
            menu={readOnly ? [] : moveMenu(card)}
          />
        ))}
      </div>
    )}
    {!readOnly && (
      <p className="mt-3 text-xs text-slate-600">
        Right-click a card to move it.
      </p>
    )}
  </Modal>
);

export default ZoneBrowser;
