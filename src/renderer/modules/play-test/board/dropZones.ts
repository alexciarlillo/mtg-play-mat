import type { ZoneId } from '@shared/game';

// Zone areas elsewhere on the board mark themselves with data-drop-zone.
export const dropZoneAt = (x: number, y: number): ZoneId | null => {
  const zones = document.querySelectorAll<HTMLElement>('[data-drop-zone]');
  for (const el of zones) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return el.dataset.dropZone as ZoneId;
    }
  }
  return null;
};
