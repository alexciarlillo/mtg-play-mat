import type { CardRef, CardView } from '@shared/game';

// A revealed card carries only its identity, so give it a throwaway view.
export const shownCard = (ref: CardRef, key: string | number): CardView => ({
  instanceId: `revealed-${key}`,
  ref,
  owner: '',
  controller: '',
  zone: 'hand',
  position: null,
  tapped: false,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
});
