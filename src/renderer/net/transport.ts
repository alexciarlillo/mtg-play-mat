import { packDescription, unpackDescription } from '@shared/net/codec';
import type { NetCommand, NetConfig, NetReport } from '@shared/net/lobby';

interface Deps {
  report(report: NetReport): void;
  createPeerConnection(config: RTCConfiguration): RTCPeerConnection;
  gatherTimeoutMs?: number;
}

const CHANNEL_LABEL = 'mtgplaymat';

// Waits for ICE gathering so every candidate is baked into the SDP; that
// is what makes a two-message exchange enough. Capped so a dead STUN
// server cannot hang the flow.
export const gatherComplete = (pc: RTCPeerConnection, ms = 3000) =>
  new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const finish = () => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    pc.addEventListener('icegatheringstatechange', onChange);
    const timer = setTimeout(finish, ms);
  });

const message = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

// Owns one peer connection and its datachannel. It moves opaque strings;
// main builds, checks, and interprets every message.
export const createNetTransport = ({
  report,
  createPeerConnection,
  gatherTimeoutMs = 3000,
}: Deps) => {
  let pc: RTCPeerConnection | null = null;
  let channel: RTCDataChannel | null = null;
  let recordWire = false;
  const wire: string[] = [];

  const wirePeer = (conn: RTCPeerConnection) => {
    conn.addEventListener('connectionstatechange', () => {
      if (conn === pc) {
        report({ type: 'connection', state: conn.connectionState });
      }
    });
  };

  const wireChannel = (chan: RTCDataChannel) => {
    channel = chan;
    chan.addEventListener('open', () => {
      if (chan === channel) report({ type: 'open' });
    });
    chan.addEventListener('close', () => {
      if (chan === channel) report({ type: 'closed' });
    });
    chan.addEventListener('message', (event: MessageEvent) => {
      if (chan === channel && typeof event.data === 'string') {
        report({ type: 'message', data: event.data });
      }
    });
  };

  const start = (config: NetConfig) => {
    recordWire = config.recordWire;
    const conn = createPeerConnection({ iceServers: config.iceServers });
    pc = conn;
    wirePeer(conn);
    return conn;
  };

  const localCode = async (conn: RTCPeerConnection) => {
    await gatherComplete(conn, gatherTimeoutMs);
    const desc = conn.localDescription;
    if (!desc || (desc.type !== 'offer' && desc.type !== 'answer')) {
      throw new Error('no local description');
    }
    return packDescription({ type: desc.type, sdp: desc.sdp });
  };

  const host = async (config: NetConfig) => {
    try {
      const conn = start(config);
      // The channel must exist before the offer so the offer includes it.
      wireChannel(conn.createDataChannel(CHANNEL_LABEL, { ordered: true }));
      await conn.setLocalDescription(await conn.createOffer());
      report({ type: 'invite', code: await localCode(conn) });
    } catch (err) {
      report({
        type: 'error',
        message: `Could not open a path: ${message(err)}`,
      });
    }
  };

  const acceptReply = async (code: string) => {
    try {
      if (!pc) throw new Error('not hosting');
      await pc.setRemoteDescription(await unpackDescription(code));
    } catch (err) {
      report({
        type: 'error',
        message: `Could not use that reply: ${message(err)}`,
      });
    }
  };

  const join = async (code: string, config: NetConfig) => {
    try {
      const desc = await unpackDescription(code);
      const conn = start(config);
      conn.addEventListener('datachannel', (event) => {
        if (conn === pc) wireChannel(event.channel);
      });
      await conn.setRemoteDescription(desc);
      await conn.setLocalDescription(await conn.createAnswer());
      report({ type: 'reply', code: await localCode(conn) });
    } catch (err) {
      report({
        type: 'error',
        message: `Could not answer that invite: ${message(err)}`,
      });
    }
  };

  const send = (data: string) => {
    if (channel?.readyState !== 'open') return;
    try {
      channel.send(data);
      if (recordWire) wire.push(data);
    } catch (err) {
      report({
        type: 'error',
        message: `Could not send. Try Resend state. (${message(err)})`,
      });
    }
  };

  const leave = () => {
    const [conn, chan] = [pc, channel];
    pc = null;
    channel = null;
    // A short delay lets a just-sent goodbye leave before the connection
    // is torn down; closing the channel alone would still flush it.
    chan?.close();
    if (chan) setTimeout(() => conn?.close(), 250);
    else conn?.close();
  };

  const handle = (command: NetCommand) => {
    switch (command.op) {
      case 'host':
        void host(command.config);
        return;
      case 'acceptReply':
        void acceptReply(command.code);
        return;
      case 'join':
        void join(command.code, command.config);
        return;
      case 'send':
        send(command.data);
        return;
      case 'leave':
        leave();
        return;
      default:
        return;
    }
  };

  return { handle, wire };
};
