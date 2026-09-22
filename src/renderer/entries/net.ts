import { rendererLog, watchForErrors } from '../debug';
import { createNetTransport } from '../net/transport';

watchForErrors('peer');

const log = rendererLog('peer');

// Hidden window: no UI, only the peer connection.
const transport = createNetTransport({
  report: (report) =>
    window.api.netReport(report).catch((err: unknown) => {
      log.warn('main rejected a report', { why: String(err) });
    }),
  createPeerConnection: (config) => new RTCPeerConnection(config),
  log,
});

window.api.onNetCommand(transport.handle);

// Only filled in test builds; lets tests see every outbound message.
Object.assign(window, { netWire: transport.wire });
