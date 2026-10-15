// What Next turn does besides moving the turn on, set in the turn panel
// and also used by the N key.
export interface TurnSettings {
  untap: boolean;
  draw: boolean;
}

const SETTINGS_KEY = 'play-test.nextTurn';
const defaults: TurnSettings = { untap: true, draw: true };

// A per-machine preference, so browser storage is enough; it may be
// unavailable, in which case the defaults apply.
export const loadTurnSettings = (): TurnSettings => {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return {
      untap: typeof saved.untap === 'boolean' ? saved.untap : defaults.untap,
      draw: typeof saved.draw === 'boolean' ? saved.draw : defaults.draw,
    };
  } catch {
    return defaults;
  }
};

export const saveTurnSettings = (settings: TurnSettings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Not saved; the choice still holds until the window reloads.
  }
};
