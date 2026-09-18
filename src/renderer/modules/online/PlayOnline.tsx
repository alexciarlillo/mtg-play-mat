import { joinLink } from '@shared/net/codec';
import type { NetState } from '@shared/net/lobby';
import classNames from 'classnames';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';

import useNetState from './useNetState';

const button =
  'rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-40';
const primary = `${button} bg-indigo-600 text-white hover:bg-indigo-500`;
const secondary = `${button} bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50`;
const codeBox =
  'w-full rounded-md border-0 p-2 font-mono text-xs text-gray-900 ring-1 ring-gray-300 break-all';

const call = (promise: Promise<unknown>) => {
  promise.catch((err: unknown) => console.error('[online]', err));
};

const CopyButton = ({ text, label }: { text: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={secondary}
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          (err: unknown) => console.error('[online] copy failed', err)
        );
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
};

const Step = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-2">
    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
    {children}
  </section>
);

const CodeOutput = ({
  label,
  code,
  link,
}: {
  label: string;
  code: string;
  link?: boolean;
}) => (
  <div className="space-y-2">
    <textarea
      readOnly
      aria-label={label}
      rows={4}
      className={codeBox}
      value={code}
      onFocus={(e) => e.currentTarget.select()}
    />
    <div className="flex gap-2">
      <CopyButton text={code} label="Copy code" />
      {link && <CopyButton text={joinLink(code)} label="Copy link" />}
    </div>
    {link && (
      <p className="text-xs text-gray-500">
        The link opens MTG Play Mat with the invite filled in, if your opponent
        has the app installed.
      </p>
    )}
  </div>
);

const CodeInput = ({
  label,
  submitLabel,
  initial = '',
  disabled,
  onSubmit,
}: {
  label: string;
  submitLabel: string;
  initial?: string;
  disabled?: boolean;
  onSubmit(code: string): void;
}) => {
  const [code, setCode] = useState(initial);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(code);
  };

  return (
    <form className="space-y-2" onSubmit={submit}>
      <textarea
        aria-label={label}
        rows={4}
        className={codeBox}
        placeholder="MPM1:…"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button type="submit" className={primary} disabled={disabled}>
        {submitLabel}
      </button>
    </form>
  );
};

const DisplayName = () => {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    void window.api.getProfile().then(({ displayName }) => {
      setName(displayName);
      setSaved(displayName);
    });
  }, []);

  const save = (e: FormEvent) => {
    e.preventDefault();
    call(
      window.api.setDisplayName(name).then(({ displayName }) => {
        setName(displayName);
        setSaved(displayName);
      })
    );
  };

  return (
    <form className="flex items-end gap-2" onSubmit={save}>
      <label className="text-sm font-medium text-gray-900">
        Your name
        <input
          aria-label="Your name"
          className="mt-1 block w-56 rounded-md border-0 px-2 py-1.5 text-gray-900 ring-1 ring-gray-300"
          maxLength={32}
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

const busyPhases: NetState['phase'][] = [
  'creatingInvite',
  'creatingReply',
  'connecting',
];

const Lobby = ({ state }: { state: NetState }) => {
  const [joining, setJoining] = useState(false);
  const { role, phase } = state;
  const idle = role === null || phase === 'ended';
  const showJoin = idle && (joining || state.pendingInvite !== null);

  if (phase === 'connected') {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          className={secondary}
          onClick={() => call(window.api.netResend())}
        >
          Resend state
        </button>
      </div>
    );
  }

  if (role === 'host' && phase !== 'ended') {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Step title="1. Send this invite to your opponent">
          {state.invite ? (
            <CodeOutput label="Invite code" code={state.invite} link />
          ) : (
            <p className="text-sm text-gray-500">Creating the invite…</p>
          )}
        </Step>
        <Step title="2. Paste the reply they send back">
          <CodeInput
            label="Reply code"
            submitLabel="Connect"
            disabled={!state.invite || phase === 'connecting'}
            onSubmit={(code) => call(window.api.netAcceptReply(code))}
          />
        </Step>
      </div>
    );
  }

  if (role === 'guest' && phase !== 'ended') {
    return (
      <Step title="Send this reply back to the host">
        {state.reply ? (
          <CodeOutput label="Your reply code" code={state.reply} />
        ) : (
          <p className="text-sm text-gray-500">Creating your reply…</p>
        )}
      </Step>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          className={primary}
          onClick={() => {
            setJoining(false);
            call(window.api.netHost());
          }}
        >
          Host a game
        </button>
        <button
          type="button"
          className={secondary}
          onClick={() => setJoining(true)}
        >
          Join a game
        </button>
      </div>
      {showJoin && (
        <Step title="Paste the invite from the host">
          <CodeInput
            key={state.pendingInvite ?? ''}
            label="Invite to join"
            submitLabel="Join"
            initial={state.pendingInvite ?? ''}
            onSubmit={(code) => call(window.api.netJoin(code))}
          />
        </Step>
      )}
    </div>
  );
};

// Hosting and joining are independent of the play test: once both sides
// are connected and have a game open, each board shows the other side.
const PlayOnline = () => {
  const state = useNetState();
  const busy = busyPhases.includes(state.phase);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Play online</h2>
          <p className="text-sm text-gray-600">
            Connect directly to one opponent by swapping two codes. Only your
            battlefield, graveyard, exile, command zone, life, and card counts
            are shared; your hand and library never leave this computer.
          </p>
        </div>
        {state.role !== null && (
          <button
            type="button"
            className={secondary}
            onClick={() => call(window.api.netLeave())}
          >
            Leave
          </button>
        )}
      </div>

      <DisplayName />

      <div
        data-testid="net-status"
        data-phase={state.phase}
        className={classNames(
          'rounded-md px-3 py-2 text-sm',
          state.phase === 'connected'
            ? 'bg-green-50 text-green-800'
            : 'bg-gray-50 text-gray-700'
        )}
      >
        {busy && <span className="mr-2 animate-pulse">●</span>}
        {state.status || 'Not connected.'}
      </div>
      {state.error && (
        <div
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </div>
      )}

      <Lobby state={state} />
    </div>
  );
};

export default PlayOnline;
