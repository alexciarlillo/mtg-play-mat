import { designationFace } from '@shared/designations';
import type { CardRef, CreateTokensAction } from '@shared/game';
import type { TokenSearchResult } from '@shared/types/cards';

import type { ContextMenuSpec } from '../../../ui/ContextMenuStore';
import { dispatch } from '../viewStore';

// A designation's card goes in on the face that stands for it, e.g. the
// Initiative rather than the Undercity on its front.
export const createTokensAction = (
  playerId: string,
  ref: CardRef,
  count: number
): CreateTokensAction => {
  const faceIndex = ref.custom ? undefined : designationFace(ref.name);
  return {
    type: 'createTokens',
    playerId,
    ref,
    count,
    ...(faceIndex !== undefined && { faceIndex }),
  };
};

// "Create <token>" for each token a card makes, once per name.
export const createTokenMenu = (
  tokens: TokenSearchResult[],
  playerId: string
): ContextMenuSpec[] => {
  const byName = new Map(tokens.map((token) => [token.ref.name, token]));
  return [...byName.values()].map(({ ref }) => ({
    title: `Create ${ref.name}`,
    action: () => dispatch(createTokensAction(playerId, ref, 1)),
  }));
};
