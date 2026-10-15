import { type Designation, designations } from '@shared/designations';
import type { CardRef } from '@shared/game';

import type { ContextMenuSpec } from '../../../ui/ContextMenuStore';
import { dispatch } from '../viewStore';

const fallbackRef = ({ name, faces }: Designation): CardRef => ({
  id: '',
  custom: true,
  name,
  typeLine: faces.map((face) => face.typeLine).join(' // '),
  faces,
  ...(faces.length > 1 && { layout: 'double_faced_token' }),
});

// Only real printings are kept: a stand-in is looked up again, so the
// card's art appears once card data has been downloaded.
const resolved = new Map<string, CardRef>();

// The newest paper printing, so it shows real art; without card data a
// plain stand-in works the same way in play.
export const designationRef = async (
  designation: Designation
): Promise<CardRef> => {
  const known = resolved.get(designation.key);
  if (known) return known;
  try {
    const found = await window.api.searchTokens(designation.name);
    const ref = found.find((r) => r.ref.name === designation.name)?.ref;
    if (ref) {
      resolved.set(designation.key, ref);
      return ref;
    }
  } catch (err) {
    console.error('[play-test] designation lookup failed', err);
  }
  return fallbackRef(designation);
};

export const placeDesignation = (
  designation: Designation,
  playerId: string
): Promise<void> =>
  designationRef(designation).then((ref) => {
    dispatch({
      type: 'createTokens',
      playerId,
      ref,
      count: 1,
      ...(designation.faceIndex !== undefined && {
        faceIndex: designation.faceIndex,
      }),
    });
  });

export const designationMenu = (playerId: string): ContextMenuSpec[] => [
  { title: 'Designations', action: null, heading: true },
  ...designations.map((designation) => ({
    title: designation.label,
    action: () => void placeDesignation(designation, playerId),
  })),
];
