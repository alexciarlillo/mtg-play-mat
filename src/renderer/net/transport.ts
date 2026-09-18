import { packDescription, unpackDescription } from '@shared/net/codec';
import type { NetCommand, NetConfig, NetReport } from '@shared/net/lobby';
import { HOST_SEAT } from '@shared/net/protocol';

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

interface Link {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
}

// Owns one peer connection and datachannel per seat: a host has one per
// guest, a guest one to the host. It moves opaque strings; main builds,
// checks, and interprets every message.
export const createNetTransport = ({
  report,
  createPeerConnection,
  gatherTimeoutMs = 3000,
}: Deps) => {
  const links = new Map<number, Link>();
  let recordWire = false;
  const wire: string[] = [];

  const current = (seat: number, pc: RTCPeerConnection) =>
    links.get(seat)?.pc === pc;

  const wireChannel = (seat: number, link: Link, chan: RTCDataChannel) => {
    link.channel = chan;
    const live = () => links.get(seat) === link && link.channel === chan;
    chan.addEventListener('open', () => {
      if (live()) report({ type: 'open', seat });
    });
    chan.addEventListener('close', () => {
      if (live()) report({ type: 'closed', seat });
    });
    chan.addEventListener('message', (event: MessageEvent) => {
      if (live() && typeof event.data === 'string') {
        report({ type: 'message', seat, data: event.data });
      }
    });
  };

  const start = (seat: number, config: NetConfig): Link => {
    close(seat);
    recordWire = config.recordWire;
    const pc = createPeerConnection({ iceServers: config.iceServers });
    const link: Link = { pc, channel: null };
    links.set(seat, link);
    pc.addEventListener('connectionstatechange', () => {
      if (current(seat, pc)) {
        report({ type: 'connection', seat, state: pc.connectionState });
      }
    });
    return link;
  };

  const localCode = async (conn: RTCPeerConnection) => {
    await gatherComplete(conn, gatherTimeoutMs);
    const desc = conn.localDescription;
    if (!desc || (desc.type !== 'offer' && desc.type !== 'answer')) {
      throw new Error('no local description');
    }
    return packDescription({ type: desc.type, sdp: desc.sdp });
  };

  const host = async (seat: number, config: NetConfig) => {
    try {
      const link = start(seat, config);
      // The channel must exist before the offer so the offer includes it.
      wireChannel(
        seat,
        link,
        link.pc.createDataChannel(CHANNEL_LABEL, { ordered: true })
      );
      await link.pc.setLocalDescription(await link.pc.createOffer());
      const code = await localCode(link.pc);
      if (links.get(seat) === link) report({ type: 'invite', seat, code });
    } catch (err) {
      report({
        type: 'error',
        seat,
        message: `Could not open a path: ${message(err)}`,
      });
    }
  };

  const acceptReply = async (seat: number, code: string) => {
    try {
      const link = links.get(seat);
      if (!link) throw new Error('no invite for that seat');
      await link.pc.setRemoteDescription(await unpackDescription(code));
    } catch (err) {
      report({
        type: 'error',
        seat,
        message: `Could not use that reply: ${message(err)}`,
      });
    }
  };

  const join = async (code: string, config: NetConfig) => {
    const seat = HOST_SEAT;
    try {
      const desc = await unpackDescription(code);
      const link = start(seat, config);
      link.pc.addEventListener('datachannel', (event) => {
        if (links.get(seat) === link) wireChannel(seat, link, event.channel);
      });
      await link.pc.setRemoteDescription(desc);
      await link.pc.setLocalDescription(await link.pc.createAnswer());
      const reply = await localCode(link.pc);
      if (links.get(seat) === link) {
        report({ type: 'reply', seat, code: reply });
      }
    } catch (err) {
      report({
        type: 'error',
        seat,
        message: `Could not answer that invite: ${message(err)}`,
      });
    }
  };

  const send = (seats: number[], data: string) => {
    for (const seat of seats) {
      const channel = links.get(seat)?.channel;
      if (channel?.readyState !== 'open') continue;
      try {
        channel.send(data);
        if (recordWire) wire.push(data);
      } catch (err) {
        report({
          type: 'error',
          seat,
          message: `Could not send. Try Resend state. (${message(err)})`,
        });
      }
    }
  };

  // A short delay lets a just-sent goodbye leave before the connection is
  // torn down; closing the channel alone would still flush it.
  function close(seat: number) {
    const link = links.get(seat);
    if (!link) return;
    links.delete(seat);
    link.channel?.close();
    if (link.channel) setTimeout(() => link.pc.close(), 250);
    else link.pc.close();
  }

  const leave = () => {
    [...links.keys()].forEach(close);
  };

  const handle = (command: NetCommand) => {
    switch (command.op) {
      case 'host':
        void host(command.seat, command.config);
        return;
      case 'acceptReply':
        void acceptReply(command.seat, command.code);
        return;
      case 'join':
        void join(command.code, command.config);
        return;
      case 'send':
        send(command.seats, command.data);
        return;
      case 'close':
        close(command.seat);
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
