import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_RELAY_KEY_LENGTH,
  MAX_RELAY_URL_LENGTH,
  type Settings as SettingsValues,
  type SettingsPatch,
} from '@shared/settings';
import { type FormEvent, type ReactNode, useState } from 'react';

import useSettings from '../../hooks/useSettings';

const secondary =
  'rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-40 bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50';

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="space-y-3">
    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
    {children}
  </section>
);

// Seeded from the saved name; the caller keys it on that name so a change
// from elsewhere replaces an unsaved edit.
const DisplayName = ({
  saved,
  onSave,
}: {
  saved: string;
  onSave(name: string): Promise<SettingsValues>;
}) => {
  const [name, setName] = useState(saved);

  const save = (e: FormEvent) => {
    e.preventDefault();
    // Main may clean the name up, so show what it actually kept.
    onSave(name).then(
      (next) => setName(next.displayName),
      (err: unknown) => console.error('[settings] could not save name', err)
    );
  };

  return (
    <form className="flex items-end gap-2" onSubmit={save}>
      <label className="text-sm font-medium text-gray-900">
        Your name
        <input
          aria-label="Your name"
          className="mt-1 block w-56 rounded-md border-0 px-2 py-1.5 text-gray-900 ring-1 ring-gray-300"
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button type="submit" className={secondary} disabled={name === saved}>
        Save
      </button>
    </form>
  );
};

const Toggle = ({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) => (
  <label className="flex items-start gap-3">
    <input
      type="checkbox"
      className="mt-1"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span>
      <span className="block text-sm font-medium text-gray-900">{label}</span>
      <span className="block text-sm text-gray-600">{description}</span>
    </span>
  </label>
);

// The relay that hands out lobby codes. Saved together, because a server
// without its key is no more use than neither. Unlike the name field
// this is not keyed on the saved value: it has to survive main rejecting
// an address long enough to say so.
const Relay = ({
  savedUrl,
  savedKey,
  onSave,
}: {
  savedUrl: string;
  savedKey: string;
  onSave(patch: SettingsPatch): Promise<SettingsValues>;
}) => {
  const [url, setUrl] = useState(savedUrl);
  const [key, setKey] = useState(savedKey);
  const [error, setError] = useState<string | null>(null);
  const unchanged = url === savedUrl && key === savedKey;

  const save = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    onSave({ relayUrl: url, relayKey: key }).then((next) => {
      setUrl(next.relayUrl);
      setKey(next.relayKey);
      // A rejected address is dropped by main, so the saved value is
      // what says whether it took.
      if (url.trim() !== '' && next.relayUrl !== url.trim()) {
        setError('That is not an http:// or https:// address.');
      }
    }, onSaveFailed);
  };

  return (
    <form className="space-y-3" onSubmit={save}>
      <label className="block text-sm font-medium text-gray-900">
        Relay server
        <input
          aria-label="Relay server"
          className="mt-1 block w-96 max-w-full rounded-md border-0 px-2 py-1.5 text-gray-900 ring-1 ring-gray-300"
          placeholder="https://relay.example.com"
          maxLength={MAX_RELAY_URL_LENGTH}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-gray-900">
        Relay key
        <input
          aria-label="Relay key"
          type="password"
          className="mt-1 block w-96 max-w-full rounded-md border-0 px-2 py-1.5 text-gray-900 ring-1 ring-gray-300"
          maxLength={MAX_RELAY_KEY_LENGTH}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <button type="submit" className={secondary} disabled={unchanged}>
        Save relay
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
};

const onSaveFailed = (err: unknown) =>
  console.error('[settings] could not save', err);

const Settings = () => {
  const { settings, loaded, update } = useSettings();

  const change = (patch: SettingsPatch) => {
    update(patch).catch((err: unknown) =>
      console.error('[settings] could not save', err)
    );
  };

  if (!loaded) return null;

  return (
    <div className="max-w-2xl space-y-8">
      <h2 className="text-lg font-semibold text-gray-900">Settings</h2>

      <Section title="Profile">
        <DisplayName
          key={settings.displayName}
          saved={settings.displayName}
          onSave={(displayName) => update({ displayName })}
        />
        <p className="text-sm text-gray-600">
          Other players see this name when you play online.
        </p>
      </Section>

      <Section title="Online play">
        <Relay
          savedUrl={settings.relayUrl}
          savedKey={settings.relayKey}
          onSave={update}
        />
        <p className="text-sm text-gray-600">
          Lobby codes are brokered by a relay server you run yourself; the
          server is in this project under <code>server/</code>. The key is the
          one its <code>RELAY_APP_KEYS</code> lists for{' '}
          <code>mtg-play-mat</code>. Leave both blank to play with invite codes
          only, which need no server.
        </p>
      </Section>

      <Section title="Play test">
        <Toggle
          label="Track turns and phases"
          description="Shows the turn counter, phase bar, and Next turn button on your board, and each opponent's turn and phase."
          checked={settings.turnTracking}
          onChange={(turnTracking) => change({ turnTracking })}
        />
        <Toggle
          label="Hand in the board window"
          description="Plays in one window: your hand docks along the bottom of the board instead of opening its own window. Anyone who sees your board, such as on a screenshare, also sees your hand. Takes effect when you next start a play test."
          checked={settings.handInBoard}
          onChange={(handInBoard) => change({ handInBoard })}
        />
      </Section>
    </div>
  );
};

export default Settings;
