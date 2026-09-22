import { parseDebugInput } from '@shared/debug';

import type DebugLog from '../../debugLog';
import type { RequestHandlers } from '../../ipc';

type DebugHandlers = Pick<
  RequestHandlers,
  'getDebugLog' | 'clearDebugLog' | 'logDebug'
>;

// Any window may add a line; main keeps the one buffer the Play online
// page shows.
const createDebugHandlers = ({ log }: { log: DebugLog }): DebugHandlers => ({
  getDebugLog: () => log.snapshot(),
  clearDebugLog: () => log.clear(),
  logDebug: (input: unknown) => {
    const entry = parseDebugInput(input);
    if (entry) log.record(entry.level, entry.scope, entry.text);
  },
});

export default createDebugHandlers;
