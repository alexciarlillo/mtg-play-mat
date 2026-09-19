import {
  MAX_DISPLAY_NAME_LENGTH,
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

      <Section title="Play test">
        <Toggle
          label="Track turns and phases"
          description="Shows the turn counter, phase bar, and Next turn button on your board, and each opponent's turn and phase."
          checked={settings.turnTracking}
          onChange={(turnTracking) => change({ turnTracking })}
        />
      </Section>
    </div>
  );
};

export default Settings;
