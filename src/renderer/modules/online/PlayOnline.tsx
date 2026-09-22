import { joinLink, lobbyLink } from '@shared/net/codec';
import type { NetMode, NetState, SeatState } from '@shared/net/lobby';
import {
  formatLobbyCode,
  LOBBY_CODE_LENGTH,
  normalizeLobbyCode,
} from '@shared/net/lobbyCode';
import classNames from 'classnames';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { Link } from 'react-router';

import useSettings from '../../hooks/useSettings';
import GameSetup from './GameSetup';
import useNetState from './useNetState';
import usePlayTestStatus from './usePlayTestStatus';

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

// The name lives on the Settings page; this just says who you'll be.
const DisplayName = () => {
  const { settings, loaded } = useSettings();
  if (!loaded) return null;
  return (
    <p data-testid="online-name" className="text-sm text-gray-700">
      Playing as{' '}
      <span className="font-semibold text-gray-900">
        {settings.displayName}
      </span>
      .{' '}
      <Link to="/settings" className="text-indigo-600 hover:text-indigo-500">
        Change it in Settings
      </Link>
    </p>
  );
};

const busyPhases: NetState['phase'][] = [
  'creatingInvite',
  'creatingReply',
  'connecting',
];

const seatBox = 'space-y-3 rounded-lg p-3 ring-1 ring-gray-200';

// One guest seat on the host: its own invite out and reply back.
const Seat = ({ seat }: { seat: SeatState }) => {
  const n = seat.seat;
  const remove = (
    <button
      type="button"
      className={secondary}
      onClick={() => call(window.api.netCloseSeat(n))}
    >
      {seat.phase === 'connected' ? `Remove seat ${n}` : `Cancel seat ${n}`}
    </button>
  );

  let body: ReactNode;
  switch (seat.phase) {
    case 'empty':
      body = (
        <button
          type="button"
          className={secondary}
          onClick={() => call(window.api.netInvite(n))}
        >
          Invite seat {n}
        </button>
      );
      break;
    case 'creatingInvite':
      body = <p className="text-sm text-gray-500">Creating the invite…</p>;
      break;
    case 'connected':
      body = (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-green-800">
            {seat.player ? seat.player.name : 'Connected, saying hello…'}
          </span>
          {remove}
        </div>
      );
      break;
    default:
      body = (
        <div className="grid gap-4 md:grid-cols-2">
          <Step title="1. Send this invite">
            {seat.invite && (
              <CodeOutput
                label={`Invite code for seat ${n}`}
                code={seat.invite}
                link
              />
            )}
          </Step>
          <Step title="2. Paste the reply they send back">
            <CodeInput
              label={`Reply code for seat ${n}`}
              submitLabel="Connect"
              disabled={seat.phase === 'connecting'}
              onSubmit={(code) => call(window.api.netAcceptReply(n, code))}
            />
            {remove}
          </Step>
        </div>
      );
  }

  return (
    <section
      data-testid={`seat-${n}`}
      data-phase={seat.phase}
      className={seatBox}
    >
      <h3 className="text-sm font-semibold text-gray-900">Seat {n}</h3>
      {body}
      {seat.error && (
        <div
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {seat.error}
        </div>
      )}
    </section>
  );
};

const Players = ({ state }: { state: NetState }) =>
  state.players.length > 1 ? (
    <ol data-testid="pod-players" className="text-sm text-gray-700">
      {state.players.map((p) => (
        <li key={p.playerId}>
          Seat {p.seat}: {p.name}
          {p.seat === 1 ? ' (host)' : ''}
        </li>
      ))}
    </ol>
  ) : null;

const ResendButton = () => (
  <button
    type="button"
    className={secondary}
    onClick={() => call(window.api.netResend())}
  >
    Resend state
  </button>
);

// Connecting works without a game, but others see an empty side until
// one is open, so point at the deck picker instead of blocking.
const NoGameNotice = () => (
  <div
    role="status"
    data-testid="no-game-notice"
    className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
  >
    You don&apos;t have a game open yet. Pick a deck and start the game above so
    the other players can see your side of the table.
  </div>
);

interface PanelProps {
  state: NetState;
  gameOpen: boolean;
  onNeedDeck(): void;
}

const InviteCodePanel = ({ state, gameOpen, onNeedDeck }: PanelProps) => {
  const [joining, setJoining] = useState(false);
  const { role, phase } = state;
  const idle = role === null || phase === 'ended';
  const showJoin = idle && (joining || state.pendingInvite !== null);
  const notice = !gameOpen && (!idle || showJoin) ? <NoGameNotice /> : null;

  if (role === 'host') {
    return (
      <div className="space-y-4">
        {notice}
        {phase === 'connected' && <ResendButton />}
        <Players state={state} />
        {state.seats.map((seat) => (
          <Seat key={seat.seat} seat={seat} />
        ))}
      </div>
    );
  }

  if (phase === 'connected') {
    return (
      <div className="space-y-4">
        {notice}
        <ResendButton />
        <Players state={state} />
      </div>
    );
  }

  if (role === 'guest' && phase !== 'ended') {
    return (
      <div className="space-y-4">
        {notice}
        <Step title="Send this reply back to the host">
          {state.reply ? (
            <CodeOutput label="Your reply code" code={state.reply} />
          ) : (
            <p className="text-sm text-gray-500">Creating your reply…</p>
          )}
        </Step>
      </div>
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
            if (!gameOpen) onNeedDeck();
            call(window.api.netHost());
          }}
        >
          Host a game
        </button>
        <button
          type="button"
          className={secondary}
          onClick={() => {
            setJoining(true);
            if (!gameOpen) onNeedDeck();
          }}
        >
          Join a game
        </button>
      </div>
      {notice}
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

// ---- lobby code tab ----------------------------------------------------

const LOBBY_CODE_PLACEHOLDER = 'ABC-123';

const NoRelayNotice = () => (
  <div
    role="status"
    data-testid="no-relay-notice"
    className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
  >
    Lobby codes need a relay server.{' '}
    <Link to="/settings" className="font-semibold underline">
      Add one in Settings
    </Link>
    , or use Invite codes, which need no server at all.
  </div>
);

// The code itself, big enough to read out over voice chat.
const LobbyCode = ({ code }: { code: string }) => (
  <div className="space-y-2">
    <output
      data-testid="lobby-code"
      className="block rounded-lg bg-gray-900 px-4 py-3 text-center font-mono text-3xl tracking-[0.3em] text-white"
    >
      {formatLobbyCode(code)}
    </output>
    <div className="flex gap-2">
      <CopyButton text={formatLobbyCode(code)} label="Copy code" />
      <CopyButton text={lobbyLink(code)} label="Copy link" />
    </div>
    <p className="text-xs text-gray-500">
      Read the code out, or send the link: it opens MTG Play Mat straight into
      your game.
    </p>
  </div>
);

const JoinByCode = ({ initial }: { initial: string }) => {
  const [code, setCode] = useState(initial);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        call(window.api.netJoinLobby(code));
      }}
    >
      <input
        aria-label="Lobby code"
        className="w-48 rounded-md border-0 px-3 py-2 text-center font-mono text-xl tracking-[0.2em] text-gray-900 uppercase ring-1 ring-gray-300"
        placeholder={LOBBY_CODE_PLACEHOLDER}
        maxLength={LOBBY_CODE_LENGTH + 1}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <div>
        <button
          type="submit"
          className={primary}
          disabled={normalizeLobbyCode(code) === null}
        >
          Join
        </button>
      </div>
    </form>
  );
};

// Relay seats have no invite of their own: they are empty until someone
// types the code, so this only reports who is in and who is missing.
const RelaySeats = ({ seats }: { seats: SeatState[] }) => {
  const free = seats.filter((seat) => seat.phase !== 'connected').length;
  return (
    <div className="space-y-2">
      {seats
        .filter((seat) => seat.phase === 'connected')
        .map((seat) => (
          <div
            key={seat.seat}
            data-testid={`seat-${seat.seat}`}
            data-phase={seat.phase}
            className="flex items-center justify-between gap-2 rounded-md px-3 py-2 ring-1 ring-gray-200"
          >
            <span className="text-sm font-medium text-green-800">
              Seat {seat.seat}:{' '}
              {seat.player ? seat.player.name : 'Connected, saying hello…'}
            </span>
            <button
              type="button"
              className={secondary}
              onClick={() => call(window.api.netCloseSeat(seat.seat))}
            >
              Remove seat {seat.seat}
            </button>
          </div>
        ))}
      <p data-testid="seats-free" className="text-sm text-gray-600">
        {free === 0
          ? 'The table is full.'
          : `${free} ${free === 1 ? 'seat' : 'seats'} still free.`}
      </p>
    </div>
  );
};

const LobbyCodePanel = ({
  state,
  gameOpen,
  onNeedDeck,
}: PanelProps): ReactNode => {
  const [joining, setJoining] = useState(false);
  const { role, phase } = state;
  const idle = role === null || phase === 'ended';
  const showJoin = idle && (joining || state.pendingLobbyCode !== null);
  const notice = !gameOpen && (!idle || showJoin) ? <NoGameNotice /> : null;

  if (role === 'host') {
    return (
      <div className="space-y-4">
        {notice}
        {state.lobbyCode ? (
          <Step title="Share this code">
            <LobbyCode code={state.lobbyCode} />
          </Step>
        ) : (
          <p className="text-sm text-gray-500">Opening a lobby…</p>
        )}
        <Players state={state} />
        <RelaySeats seats={state.seats} />
        {phase === 'connected' && <ResendButton />}
      </div>
    );
  }

  if (role === 'guest' && phase !== 'ended') {
    return (
      <div className="space-y-4">
        {notice}
        {phase === 'connected' ? (
          <>
            <ResendButton />
            <Players state={state} />
          </>
        ) : (
          <p className="text-sm text-gray-500">
            Joining {state.lobbyCode ? formatLobbyCode(state.lobbyCode) : ''}…
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!state.relayReady && <NoRelayNotice />}
      <div className="flex gap-2">
        <button
          type="button"
          className={primary}
          disabled={!state.relayReady}
          onClick={() => {
            setJoining(false);
            if (!gameOpen) onNeedDeck();
            call(window.api.netHostLobby());
          }}
        >
          Host a game
        </button>
        <button
          type="button"
          className={secondary}
          disabled={!state.relayReady}
          onClick={() => {
            setJoining(true);
            if (!gameOpen) onNeedDeck();
          }}
        >
          Join a game
        </button>
      </div>
      {notice}
      {showJoin && (
        <Step title="Type the code the host gave you">
          <JoinByCode
            key={state.pendingLobbyCode ?? ''}
            initial={
              state.pendingLobbyCode
                ? formatLobbyCode(state.pendingLobbyCode)
                : ''
            }
          />
        </Step>
      )}
    </div>
  );
};

// ---- tabs --------------------------------------------------------------

const TABS: { mode: NetMode; label: string; blurb: string }[] = [
  {
    mode: 'relay',
    label: 'Lobby code',
    blurb:
      'The host opens a lobby and reads out a short code. Everyone who ' +
      'types it in lands at the table. Messages pass through a relay ' +
      'server, so it works from anywhere.',
  },
  {
    mode: 'p2p',
    label: 'Invite codes',
    blurb:
      'No server at all: the host sends each player a long invite code and ' +
      'pastes back their reply. Players connect to the host directly, which ' +
      'some home networks will not allow.',
  },
];

const tabClass = (active: boolean) =>
  classNames(
    'px-3 py-1.5 text-sm font-semibold -mb-px border-b-2',
    active
      ? 'border-indigo-600 text-indigo-700'
      : 'border-transparent text-gray-500 hover:text-gray-800 disabled:hover:text-gray-500'
  );

// A live session pins the tab to the mode it started in; switching would
// only be a way to lose it.
const ConnectionTabs = ({ state, gameOpen, onNeedDeck }: PanelProps) => {
  const [chosen, setChosen] = useState<NetMode | null>(null);
  const locked = state.role !== null && state.phase !== 'ended';
  // A link is a direct instruction, so it picks the tab it belongs to
  // even if the player had chosen the other one.
  const linked: NetMode | null = state.pendingInvite
    ? 'p2p'
    : state.pendingLobbyCode
      ? 'relay'
      : null;
  const active = (locked ? state.mode : null) ?? linked ?? chosen ?? 'relay';
  const tab = TABS.find((entry) => entry.mode === active) ?? TABS[0];

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="How to connect"
        className="flex gap-1 border-b border-gray-200"
      >
        {TABS.map((entry) => (
          <button
            key={entry.mode}
            type="button"
            role="tab"
            id={`tab-${entry.mode}`}
            aria-selected={entry.mode === active}
            aria-controls={`panel-${entry.mode}`}
            disabled={locked && entry.mode !== active}
            className={tabClass(entry.mode === active)}
            onClick={() => setChosen(entry.mode)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        data-testid={`panel-${active}`}
        className="space-y-4"
      >
        <p className="text-sm text-gray-600">{tab.blurb}</p>
        {active === 'relay' ? (
          <LobbyCodePanel
            state={state}
            gameOpen={gameOpen}
            onNeedDeck={onNeedDeck}
          />
        ) : (
          <InviteCodePanel
            state={state}
            gameOpen={gameOpen}
            onNeedDeck={onNeedDeck}
          />
        )}
      </div>
    </div>
  );
};

// Hosting and joining are independent of the play test: once both sides
// are connected and have a game open, each board shows the other side.
const PlayOnline = () => {
  const state = useNetState();
  const playTest = usePlayTestStatus();
  const deckSelect = useRef<HTMLSelectElement>(null);
  const busy = busyPhases.includes(state.phase);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Play online</h2>
          <p className="text-sm text-gray-600">
            Pick a deck and start your game, then host or join. Play with up to
            three others; everyone connects to the host. Only your battlefield,
            graveyard, exile, command zone, life, and card counts are shared;
            your hand and library never leave this computer.
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

      <GameSetup status={playTest} selectRef={deckSelect} />

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

      <ConnectionTabs
        state={state}
        gameOpen={playTest.open}
        onNeedDeck={() => deckSelect.current?.focus()}
      />
    </div>
  );
};

export default PlayOnline;
