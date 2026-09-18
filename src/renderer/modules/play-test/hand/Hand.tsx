import type { CardView, PrivateView } from '@shared/game';

import Card from '../../../ui/Card';
import { dispatch, useView, type ViewStore } from '../viewStore';

const play = (card: CardView) => {
  dispatch({
    type: 'moveCard',
    instanceId: card.instanceId,
    to: 'battlefield',
  });
};

const Hand = ({ store }: { store: ViewStore<PrivateView> }) => {
  const view = useView(store);

  return (
    <div className="h-full w-screen bg-slate-800">
      <div className="w-screen h-6 text-center bg-slate-200 [-webkit-app-region:drag]">
        Hand
      </div>
      <div data-testid="hand" className="grid grid-cols-7 gap-y-2">
        {view?.hand.map((card) => (
          <Card key={card.instanceId} card={card} onClick={play} />
        ))}
      </div>
    </div>
  );
};

export default Hand;
