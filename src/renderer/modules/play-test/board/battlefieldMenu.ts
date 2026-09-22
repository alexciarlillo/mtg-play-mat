import {
  canTransform,
  type CardView,
  counterNames,
  currentFace,
} from '@shared/game';

import { isPlaneswalker } from '../../../ui/cardStats';
import type { ContextMenuSpec } from '../../../ui/ContextMenuStore';
import { moveMenu } from '../common/cardMenus';
import { dispatch } from '../viewStore';
import type { ControlTarget } from './pod';

export const adjustCounter = (card: CardView, counter: string, delta: number) =>
  dispatch({
    type: 'adjustCounter',
    instanceId: card.instanceId,
    counter,
    delta,
  });

export interface BattlefieldMenuOptions {
  onAddCounter?(card: CardView): void;
  onAttach?(card: CardView): void;
  // Players this permanent may be handed to.
  giveTo?: ControlTarget[];
  // Set for a borrowed permanent: who it goes back to.
  ownerName?: string;
}

const logControlError = (err: unknown) => {
  console.error('[play-test] change of control failed', err);
};

// A borrowed permanent can only go back; one's own can be handed over.
const controlMenu = (
  card: CardView,
  giveTo: ControlTarget[],
  ownerName: string | undefined
): ContextMenuSpec[] => {
  const { instanceId } = card;
  if (card.owner !== card.controller) {
    return [
      {
        title: `Return to ${ownerName ?? 'owner'}`,
        action: () => {
          window.api.returnControl(instanceId).catch(logControlError);
        },
      },
    ];
  }
  return giveTo.map(({ playerId, name }) => ({
    title: `Give control to ${name}`,
    action: () => {
      window.api.giveControl(instanceId, playerId).catch(logControlError);
    },
  }));
};

// Everything the owner can do to one of their permanents. card.ref is the
// public one, so a face-down card offers no transform (it can't have one).
export const battlefieldMenu = (
  card: CardView,
  {
    onAddCounter,
    onAttach,
    giveTo = [],
    ownerName,
  }: BattlefieldMenuOptions = {}
): ContextMenuSpec[] => {
  const { instanceId } = card;
  const next =
    card.ref && !card.faceDown && canTransform(card.ref)
      ? currentFace(card.ref, (card.faceIndex + 1) % card.ref.faces.length)
      : undefined;

  return [
    {
      title: card.tapped ? 'Untap' : 'Tap',
      action: () => dispatch({ type: 'toggleTap', instanceId }),
    },
    ...(next
      ? [
          {
            title: `Transform to ${next.name}`,
            action: () => dispatch({ type: 'transform', instanceId }),
          },
        ]
      : []),
    {
      title: card.faceDown ? 'Turn face up' : 'Turn face down',
      action: () =>
        dispatch({ type: 'setFaceDown', instanceId, faceDown: !card.faceDown }),
    },
    {
      title: 'Add +1/+1 counter',
      action: () => adjustCounter(card, counterNames.plusOne, 1),
    },
    {
      title: 'Add -1/-1 counter',
      action: () => adjustCounter(card, counterNames.minusOne, 1),
    },
    ...(isPlaneswalker(card)
      ? [
          {
            title: 'Loyalty +1',
            action: () => adjustCounter(card, counterNames.loyalty, 1),
          },
          {
            title: 'Loyalty -1',
            action: () => adjustCounter(card, counterNames.loyalty, -1),
          },
        ]
      : []),
    ...(onAddCounter
      ? [{ title: 'Add counter…', action: () => onAddCounter(card) }]
      : []),
    {
      title: 'Create copy',
      action: () => dispatch({ type: 'copyCard', instanceId }),
    },
    ...(onAttach
      ? [{ title: 'Attach to…', action: () => onAttach(card) }]
      : []),
    ...(card.attachedTo
      ? [
          {
            title: 'Detach',
            action: () => dispatch({ type: 'attach', instanceId, to: null }),
          },
        ]
      : []),
    ...controlMenu(card, giveTo, ownerName),
    ...moveMenu(card),
  ];
};
