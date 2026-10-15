import type { CardView } from '@shared/game';
import type { BrowserZone } from '@shared/settings';

import CardBrowser from '../common/CardBrowser';
import { moveMenu } from '../common/cardMenus';
import { Modal } from '../common/Dialogs';

interface Props {
  title: string;
  zone: Exclude<BrowserZone, 'library'>;
  cards: CardView[];
  onClose(): void;
  readOnly?: boolean;
}

// Every card in a public zone, each with the move menu unless it belongs
// to an opponent.
const ZoneBrowser = ({
  title,
  zone,
  cards,
  onClose,
  readOnly = false,
}: Props) => (
  <Modal title={`${title} (${cards.length})`} onClose={onClose} wide column>
    <CardBrowser
      zone={zone}
      cards={cards}
      label={`Search the ${zone}`}
      testId="zone-browser"
      tileTestId="zone-card"
      menu={readOnly ? undefined : moveMenu}
    />
    {!readOnly && cards.length > 0 && (
      <p className="mt-2 shrink-0 text-xs text-slate-600">
        Right-click a card to move it.
      </p>
    )}
  </Modal>
);

export default ZoneBrowser;
