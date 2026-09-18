import type CardDataService from '../../cardData/CardDataService';
import type { RequestHandlers } from '../../ipc';

type CardDataHandlers = Pick<
  RequestHandlers,
  'getCardDataStatus' | 'updateCardData'
>;

const createCardDataHandlers = ({
  cardData,
}: {
  cardData: CardDataService;
}): CardDataHandlers => ({
  getCardDataStatus: () => cardData.getStatus(),
  updateCardData: () => {
    void cardData.check({ force: true });
    return cardData.getStatus();
  },
});

export default createCardDataHandlers;
