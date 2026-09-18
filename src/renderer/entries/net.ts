import { createNetTransport } from '../net/transport';

// Hidden window: no UI, only the peer connection.
const transport = createNetTransport({
  report: (report) =>
    window.api.netReport(report).catch((err: unknown) => {
      console.warn('[net] report rejected', err);
    }),
  createPeerConnection: (config) => new RTCPeerConnection(config),
});

window.api.onNetCommand(transport.handle);

// Only filled in test builds; lets tests see every outbound message.
Object.assign(window, { netWire: transport.wire });
