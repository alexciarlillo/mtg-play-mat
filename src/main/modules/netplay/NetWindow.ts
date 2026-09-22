import { nullLog, type ScopedLog } from '@shared/debug';
import type { NetCommand } from '@shared/net/lobby';
import type { BrowserWindow, WebContents } from 'electron';

import { sendEvent } from '../../ipc';
import { createWindow, whenLoaded } from '../../windows';
import type { Transport } from './Netplay';

// Long enough for a goodbye message to leave before the window goes.
const RETIRE_GRACE_MS = 1500;

// WebRTC only exists in renderers, so the peer connection lives in a
// hidden window that stays up even when the app window is closed.
export default class NetWindow implements Transport {
  private window: BrowserWindow | null = null;

  constructor(
    private readonly onCrash: () => void,
    private readonly log: ScopedLog = nullLog
  ) {}

  // Main only accepts net reports from the current net window.
  isNetSender = (sender: WebContents): boolean =>
    this.window !== null &&
    !this.window.isDestroyed() &&
    sender === this.window.webContents;

  get webContents(): WebContents | null {
    return this.window && !this.window.isDestroyed()
      ? this.window.webContents
      : null;
  }

  open = async (): Promise<boolean> => {
    if (!this.window || this.window.isDestroyed()) {
      this.log.info('opening the connection window');
      const window = createWindow({
        html: 'net.html',
        width: 400,
        height: 200,
        show: false,
        skipTaskbar: true,
        backgroundThrottling: false,
      });
      this.window = window;
      window.webContents.on('render-process-gone', (_event, details) => {
        this.log.error('the connection window died', {
          why: details.reason,
          code: details.exitCode,
        });
        if (this.window === window) this.onCrash();
      });
      window.on('closed', () => {
        if (this.window === window) this.window = null;
      });
    }
    return whenLoaded(this.window);
  };

  send = (command: NetCommand) => {
    sendEvent(this.window, 'netCommand', command);
  };

  retire = () => {
    const window = this.window;
    this.window = null;
    if (!window) return;
    setTimeout(() => {
      if (!window.isDestroyed()) window.destroy();
    }, RETIRE_GRACE_MS);
  };
}
