import { describe, expect, it } from 'vitest';

import { eventChannels, eventListenerName, requestChannels } from './contract';

describe('ipc contract', () => {
  it('derives on<Event> listener names', () => {
    expect(eventListenerName('deckLoaded')).toBe('onDeckLoaded');
    expect(eventChannels.map(eventListenerName)).toEqual([
      'onDeckLoaded',
      'onCardDrawn',
      'onCardPlayed',
    ]);
  });

  it('keeps request and event channels distinct', () => {
    const listenerNames = eventChannels.map(eventListenerName);
    const names = [...requestChannels, ...eventChannels, ...listenerNames];
    expect(new Set(names).size).toBe(names.length);
  });
});
