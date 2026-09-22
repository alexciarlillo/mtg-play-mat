import classNames from 'classnames';

import type { Flash } from './useValueFlash';

// Damage flashes red and life gained green, then both fade back over
// about a second. The change itself is near-instant, so it catches the
// eye; only the way back is slow.
export const lifeFlashClass = (flash: Flash, resting: string): string =>
  classNames(
    'transition-colors',
    flash ? 'duration-100' : 'duration-1000',
    flash === 'down' && 'text-red-500',
    flash === 'up' && 'text-emerald-400',
    !flash && resting
  );
