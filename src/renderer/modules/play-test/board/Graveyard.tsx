import type { CardView } from '@shared/game';

import Card from '../../../ui/Card';

const Graveyard = ({ cards }: { cards: CardView[] }) => (
  <div data-testid="graveyard" className="relative">
    {cards.map((card, index) => (
      <div
        className="absolute"
        style={{ top: `${index * 30}px` }}
        key={card.instanceId}
      >
        <Card card={card} />
      </div>
    ))}
  </div>
);

export default Graveyard;
