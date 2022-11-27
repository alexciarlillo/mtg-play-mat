export default class IpcChannel {
  ipc = null;

  constructor({ ipc }) {
    this.ipc = ipc;
  }

  Send = (event, data, ...args) => {
    this.ipc.send(event, data, ...args);
  };

  On = (event, handler) => {
    return this.ipc.on(event, handler);
  };

  Once = (event, handler) => {
    this.ipc.once(event, handler);
  };
}
