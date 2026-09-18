import { BrowserWindow } from 'electron';

import type IpcBus from './ipc/IpcBus';
import WindowManager, {
  RegisterModuleWindowOptions,
  WindowOnClosedOptions,
} from './WindowManager';

export interface ModuleDeps {
  windowManager: WindowManager;
  ipcBus: IpcBus;
}

export interface BaseModuleConstructorOptions extends ModuleDeps {
  name: string;
  label: string;
}

export default class BaseModule {
  name: string;

  label: string;

  windowManager: WindowManager;

  ipcBus: IpcBus;

  windowsById: { [key: number]: BrowserWindow };

  constructor({
    name,
    label,
    windowManager,
    ipcBus,
  }: BaseModuleConstructorOptions) {
    this.name = name;
    this.label = label;
    this.windowManager = windowManager;
    this.ipcBus = ipcBus;
    this.windowsById = {};
  }

  get mainWindow() {
    return this.windowManager.mainWindow;
  }

  registerModuleWindow = ({
    width = 500,
    height = 500,
    onReady,
    onClosed,
    ...windowProps
  }: RegisterModuleWindowOptions) => {
    const win = this.windowManager.registerWindow({
      width,
      height,
      onReady: (_window: BrowserWindow) => {
        onReady?.(_window);
      },
      onClosed: ({ windowId }: WindowOnClosedOptions) => {
        delete this.windowsById[windowId];
        onClosed?.({ windowId });
      },
      ...windowProps,
    });

    this.windowsById[win.id] = win;

    return win;
  };
}
