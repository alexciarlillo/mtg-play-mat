import type CardModel from '@shared/models/CardModel';
import type { CardModelProps } from '@shared/models/CardModel';

// IPC arguments must be plain data; a copy also drops any MobX proxies.
export const toCardProps = (card: CardModel): CardModelProps => ({
  ...card,
  keywords: [...card.keywords],
});
