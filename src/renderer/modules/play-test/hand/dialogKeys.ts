import type { MouseEvent } from 'react';

// Keys belong to a field being typed in, and Enter or Space to a button
// the player tabbed to.
export const ownsKey = (target: EventTarget | null, key: string) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) {
    return target.type !== 'checkbox' || key === ' ';
  }
  if (target.tagName === 'BUTTON') return key === 'Enter' || key === ' ';
  return ['TEXTAREA', 'SELECT'].includes(target.tagName);
};

// A clicked button would otherwise keep focus and take the next Space or
// Enter as another click. The click itself still happens, and a field
// being typed in hands the keys back to the dialog.
export const keepFocusOnClick = (e: MouseEvent<HTMLElement>) => {
  if (!(e.target instanceof Element) || !e.target.closest('button')) return;
  e.preventDefault();
  const active = document.activeElement;
  if (active instanceof HTMLElement && ownsKey(active, 'a')) {
    e.currentTarget.focus();
  }
};
