import {
  canTransform,
  type CardView,
  counterNames,
  currentFace,
  type ZoneId,
} from '@shared/game';

import { isPlaneswalker } from '../../../ui/cardStats';
import type { ContextMenuSpec } from '../../../ui/ContextMenuStore';
import type { RevealTarget } from '@shared/net/revealTargets';
import type { TokenSearchResult } from '@shared/types/cards';

import { moveMenu } from '../common/cardMenus';
import { revealMenu, revealTo } from '../common/targetedReveal';
import { createTokenMenu } from '../common/tokenMenu';
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
  onPutInLibrary?(card: CardView): void;
  // Players this permanent may be handed to.
  giveTo?: ControlTarget[];
  // Set for a borrowed permanent: who it goes back to.
  ownerName?: string;
  // Who the owner may show a face-down permanent to alone.
  revealTargets?: RevealTarget[];
  // The tokens this card makes.
  tokens?: TokenSearchResult[];
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

const cardCount = (n: number) => `${n} card${n === 1 ? '' : 's'}`;

const groupMoves: { title: string; to: ZoneId; index?: number }[] = [
  { title: 'to hand', to: 'hand' },
  { title: 'to graveyard', to: 'graveyard' },
  { title: 'to exile', to: 'exile' },
  { title: 'to library top', to: 'library', index: 0 },
  { title: 'to library bottom', to: 'library' },
];

// What a selection of several permanents can do together, each item one
// action. Only a group of commanders may go to the command zone.
export const selectionMenu = (
  cards: CardView[],
  onClear: () => void
): ContextMenuSpec[] => {
  const n = cards.length;
  const playerId = cards[0]?.controller ?? '';
  const instanceIds = cards.map((card) => card.instanceId);
  const setTapped = (tapped: boolean) =>
    dispatch({ type: 'setTapped', playerId, instanceIds, tapped });
  const moves = cards.every((card) => card.isCommander)
    ? [{ title: 'to command zone', to: 'command' as const }, ...groupMoves]
    : groupMoves;
  // Counts only the cards that would change.
  const untapped = cards.filter((card) => !card.tapped).length;
  const tapped = n - untapped;
  return [
    { title: `${n} selected`, action: null, heading: true },
    ...(untapped > 0
      ? [{ title: `Tap ${cardCount(untapped)}`, action: () => setTapped(true) }]
      : []),
    ...(tapped > 0
      ? [
          {
            title: `Untap ${cardCount(tapped)}`,
            action: () => setTapped(false),
          },
        ]
      : []),
    ...moves.map(({ title, to, index }) => ({
      title: `Move ${n} ${title}`,
      action: () =>
        dispatch({
          type: 'moveCards',
          playerId,
          instanceIds,
          to,
          ...(index !== undefined && { index }),
        }),
    })),
    { title: 'Clear selection', action: onClear },
  ];
};

// Everything the owner can do to one of their permanents. card.ref is the
// public one, so a face-down card offers no transform (it can't have one).
export const battlefieldMenu = (
  card: CardView,
  {
    onAddCounter,
    onAttach,
    onPutInLibrary,
    giveTo = [],
    ownerName,
    revealTargets = [],
    tokens = [],
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
    // Only its owner knows a face-down card, and only main reads it.
    ...(card.faceDown && card.owner === card.controller
      ? revealMenu(
          'Reveal',
          revealTargets,
          () =>
            dispatch({
              type: 'reveal',
              playerId: card.owner,
              source: 'card',
              instanceId,
            }),
          (to) => revealTo({ to, source: 'faceDown', instanceId })
        )
      : []),
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
    ...createTokenMenu(card.faceDown ? [] : tokens, card.controller),
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
    // The prompt counts this player's library, not a lender's.
    ...moveMenu(
      card,
      {},
      {
        onPutInLibrary:
          card.owner === card.controller ? onPutInLibrary : undefined,
      }
    ),
  ];
};
