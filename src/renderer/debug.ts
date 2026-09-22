import {
  type DebugFields,
  type DebugLevel,
  describeError,
  formatDebugText,
  type ScopedLog,
} from '@shared/debug';

// A window's own lines go to main, which keeps the one buffer. A log
// line must never be the reason something fails, so a rejected send is
// dropped.
const send = (level: DebugLevel, scope: string, text: string) => {
  window.api.logDebug({ level, scope, text }).catch(() => {});
};

export const rendererLog = (scope: string): ScopedLog => {
  const at = (level: DebugLevel) => (text: string, fields?: DebugFields) => {
    send(level, scope, formatDebugText(text, fields));
  };
  return {
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
  };
};

// Multiplayer is what the log is for, but an exception anywhere in a
// window is worth catching: it is usually why multiplayer stopped.
export const watchForErrors = (scope: string): void => {
  const log = rendererLog(scope);
  window.addEventListener('error', (event: ErrorEvent) => {
    log.error('uncaught exception', {
      what: event.message,
      at: event.filename
        ? `${event.filename}:${event.lineno}:${event.colno}`
        : undefined,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    log.error('unhandled rejection', { what: describeError(event.reason) });
  });
};
