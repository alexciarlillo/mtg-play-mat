import { matImageUrl } from '@shared/mat';
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_RELAY_KEY_LENGTH,
  MAX_RELAY_URL_LENGTH,
  type Settings as SettingsValues,
  type SettingsPatch,
} from '@shared/settings';
import { type FormEvent, type ReactNode, useState } from 'react';

import useSettings from '../../hooks/useSettings';
import { cardBackUrl } from '../../ui/cardImages';

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

// The play area background. It is drawn as a playmat-shaped object
// under the battlefield, so the preview here has that shape too rather
// than the picture's own.
const PlayArea = ({ matImage }: { matImage: string }) => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = () => {
    setBusy(true);
    setError(null);
    window.api
      .chooseMatImage()
      .then((choice) => setError(choice.error))
      .catch((err: unknown) => {
        onSaveFailed(err);
        setError('That image could not be used. Try another file.');
      })
      .finally(() => setBusy(false));
  };

  const clear = () => {
    setError(null);
    window.api.clearMatImage().catch(onSaveFailed);
  };

  return (
    <div className="space-y-3">
      {matImage ? (
        <div
          data-testid="mat-preview"
          data-mat={matImage}
          className="aspect-[24/14] w-64 rounded-lg bg-cover bg-center ring-1 ring-gray-300"
          style={{ backgroundImage: `url("${matImageUrl(matImage)}")` }}
        />
      ) : (
        <div
          data-testid="mat-preview"
          className="flex aspect-[24/14] w-64 items-center justify-center rounded-lg bg-neutral-400 text-sm text-neutral-700 ring-1 ring-gray-300"
        >
          Bare table
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={secondary}
          disabled={busy}
          onClick={choose}
        >
          {matImage ? 'Choose another image…' : 'Choose an image…'}
        </button>
        {matImage && (
          <button type="button" className={secondary} onClick={clear}>
            Remove
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
};

// The back of every card the player owns, as the whole table sees it.
// The preview is card-shaped, since that is the part every board draws.
const CardBack = ({ cardBack }: { cardBack: string }) => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = () => {
    setBusy(true);
    setError(null);
    window.api
      .chooseCardBack()
      .then((choice) => setError(choice.error))
      .catch((err: unknown) => {
        onSaveFailed(err);
        setError('That image could not be used. Try another file.');
      })
      .finally(() => setBusy(false));
  };

  const clear = () => {
    setError(null);
    window.api.clearCardBack().catch(onSaveFailed);
  };

  const openGallery = () => {
    window.api.openCardBackGallery().catch((err: unknown) => {
      console.error('[settings] could not open the gallery', err);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-4">
        <img
          data-testid="card-back-preview"
          data-back={cardBack || undefined}
          src={cardBack ? matImageUrl(cardBack) : cardBackUrl}
          alt={cardBack ? 'Your card back' : 'The standard card back'}
          className="aspect-card w-24 rounded-lg object-cover ring-1 ring-gray-300"
        />
        <div className="flex gap-2">
          <button
            type="button"
            className={secondary}
            disabled={busy}
            onClick={choose}
          >
            {cardBack ? 'Choose another card back…' : 'Choose a card back…'}
          </button>
          {cardBack && (
            <button type="button" className={secondary} onClick={clear}>
              Use the standard back
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <p className="text-sm text-gray-600">
        Looking for one? MPC Autofill has a large community collection:{' '}
        <button
          type="button"
          className="font-medium text-blue-700 underline hover:text-blue-900"
          onClick={openGallery}
        >
          browse card backs on mpcfill.com
        </button>{' '}
        (choose Cardbacks under card type), download one, then choose it here.
      </p>
    </div>
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

      <Section title="Play area">
        <PlayArea matImage={settings.matImage} />
        <p className="text-sm text-gray-600">
          A PNG or JPEG under your battlefield, shaped like a real 24x14
          playmat. It is part of the table rather than wallpaper behind the
          window: it scales with your cards, so a card left on a patch of art
          stays there whatever size the window is, and a wide window shows bare
          table beside it rather than stretching the picture.
        </p>
      </Section>

      <Section title="Card back">
        <CardBack cardBack={settings.cardBack} />
        <p className="text-sm text-gray-600">
          A PNG or JPEG on the back of every card you own, seen by everyone at
          the table: your library, and your face-down cards, even on someone
          else&apos;s battlefield. The middle of the picture is used, cut to the
          shape of a card.
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
