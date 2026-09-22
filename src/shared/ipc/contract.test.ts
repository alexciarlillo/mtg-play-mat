import { describe, expect, it } from 'vitest';

import { eventChannels, eventListenerName, requestChannels } from './contract';

describe('ipc contract', () => {
  it('derives on<Event> listener names', () => {
    expect(eventListenerName('boardView')).toBe('onBoardView');
    expect(eventChannels.map(eventListenerName)).toEqual([
      'onBoardView',
      'onHandView',
      'onCardDataStatus',
      'onNetState',
      'onNetCommand',
      'onOpponentView',
      'onCommanderPrompts',
      'onUndoState',
      'onGameStarted',
      'onSettingsChanged',
      'onPlayTestStatus',
      'onBoardMenuCommand',
      'onNavigate',
      'onDebugLog',
    ]);
  });

  it('keeps request and event channels distinct', () => {
    const listenerNames = eventChannels.map(eventListenerName);
    const names = [...requestChannels, ...eventChannels, ...listenerNames];
    expect(new Set(names).size).toBe(names.length);
  });
});
