import {
  defaultSettings,
  type Settings,
  type SettingsPatch,
} from '@shared/settings';
import { useCallback, useEffect, useState } from 'react';

interface SettingsState {
  settings: Settings;
  // False until main has answered; until then settings are the defaults.
  loaded: boolean;
  update(patch: SettingsPatch): Promise<Settings>;
}

// App preferences, kept live by main's settingsChanged pushes, so a change
// made in any window shows up in every other one.
const useSettings = (): SettingsState => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let pushed = false;
    const unsubscribe = window.api.onSettingsChanged((next) => {
      pushed = true;
      setSettings(next);
      setLoaded(true);
    });
    // A push that lands first is newer than this snapshot.
    window.api.getSettings().then(
      (initial) => {
        if (!pushed) setSettings(initial);
        setLoaded(true);
      },
      (err: unknown) => console.error('[settings] failed to load', err)
    );
    return unsubscribe;
  }, []);

  // Applied locally first so a checkbox flips on click; main's answer
  // (which may have cleaned a value) then replaces the guess.
  const update = useCallback(async (patch: SettingsPatch) => {
    setSettings((current) => ({ ...current, ...patch }));
    try {
      const next = await window.api.updateSettings(patch);
      setSettings(next);
      return next;
    } catch (err) {
      setSettings(await window.api.getSettings());
      throw err;
    }
  }, []);

  return { settings, loaded, update };
};

export default useSettings;
