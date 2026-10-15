import type {
  PlayerAction,
  PrivateLogEntry,
  RevealRequest,
  ShownToYou,
} from '@shared/game';
import type { Api } from '@shared/ipc/contract';
import type { RevealTarget } from '@shared/net/revealTargets';
import { useEffect, useState } from 'react';

import type { ContextMenuSpec } from '../../../ui/ContextMenuStore';

// A value main holds and pushes whenever it changes: fetched once on
// mount, so a reloaded window has it too.
const useMainValue = <T>(
  get: () => Promise<T>,
  subscribe: (listener: (value: T) => void) => () => void,
  initial: T,
  what: string
): T => {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let live = true;
    // A push is newer than whatever the fetch comes back with.
    let pushed = false;
    const off = subscribe((next) => {
      pushed = true;
      setValue(next);
    });
    get().then(
      (next) => {
        if (live && !pushed) setValue(next);
      },
      (err: unknown) => {
        console.error(`[play-test] failed to read ${what}`, err);
      }
    );
    return () => {
      live = false;
      off();
    };
    // The api is fixed for the window's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
};

const api = (): Api => window.api;

const NONE: never[] = [];

// Everyone else at the table, each marked with whether they can be
// shown cards. Empty outside a pod.
export const useRevealTargets = (): RevealTarget[] =>
  useMainValue(
    () => api().getRevealTargets(),
    (listener) => api().onRevealTargets(listener),
    NONE,
    'reveal targets'
  );

// Cards other players showed this one. Only the hand's window gets them.
export const useShownToYou = (): ShownToYou[] =>
  useMainValue(
    () => api().getShownToYou(),
    (listener) => api().onShownToYou(listener),
    NONE,
    'cards shown to you'
  );

export const usePrivateLog = (): PrivateLogEntry[] =>
  useMainValue(
    () => api().getPrivateLog(),
    (listener) => api().onPrivateLog(listener),
    NONE,
    'the private log'
  );

const logError = (what: string) => (err: unknown) => {
  console.error(`[play-test] failed to ${what}`, err);
};

export const revealTo = (request: RevealRequest, then?: PlayerAction) => {
  api().revealTo(request, then).catch(logError('reveal cards'));
};

export const stopShowing = () => {
  api().stopShowing().catch(logError('stop showing cards'));
};

export const dismissShown = (key: string | null) => {
  api().dismissShown(key).catch(logError('dismiss shown cards'));
};

export const EVERYONE = 'everyone';

// The picker's choice: everyone (the public reveal), or one player.
export type RevealChoice = typeof EVERYONE | string;

export const targetLabel = (target: RevealTarget) =>
  target.ready ? target.name : `${target.name} (${target.why ?? 'not ready'})`;

export interface RevealChoiceState {
  value: RevealChoice;
  // Remembered from when it was chosen, for a player who has left.
  name: string;
  // Whether a reveal can go to the choice right now. A choice that can't
  // is kept, never quietly widened to everyone.
  ready: boolean;
  why?: string;
  gone: boolean;
  set(value: RevealChoice): void;
}

export const useRevealChoice = (targets: RevealTarget[]): RevealChoiceState => {
  const [choice, setChoice] = useState({ value: EVERYONE, name: 'Everyone' });
  const set = (value: RevealChoice) => {
    const name = targets.find((t) => t.playerId === value)?.name ?? value;
    setChoice({ value, name: value === EVERYONE ? 'Everyone' : name });
  };
  if (choice.value === EVERYONE) {
    return { ...choice, ready: true, gone: false, set };
  }
  const live = targets.find((t) => t.playerId === choice.value);
  return {
    value: choice.value,
    name: live?.name ?? choice.name,
    ready: live?.ready ?? false,
    why: live ? live.why : 'left the table',
    gone: !live,
    set,
  };
};

// "Everyone" first, then each other player. A player who can't take a
// reveal is listed, greyed out, with why. Outside a pod it stays the
// single item it always was.
export const revealMenu = (
  title: string,
  targets: RevealTarget[],
  toEveryone: () => void,
  toPlayer: (playerId: string) => void
): ContextMenuSpec[] => {
  if (targets.length === 0) return [{ title, action: toEveryone }];
  return [
    { title: `${title} to everyone`, action: toEveryone },
    ...targets.map((target) => ({
      title: `${title} to ${targetLabel(target)}`,
      action: target.ready ? () => toPlayer(target.playerId) : null,
    })),
  ];
};

// Who a showing is for, as the viewer reads it.
export const showingToName = (
  to: string,
  selfId: string | undefined,
  names: Record<string, string>
) => (to === selfId ? 'you' : (names[to] ?? 'another player'));
