import { BrowserWindow } from 'electron';

import WindowManager, {
  RegisterModuleWindowOptions,
  WindowOnClosedOptions,
} from './WindowManager';

export interface BaseModuleConstructorOptions {
  name: string;
  label: string;
  windowManager: WindowManager; // Need window types
  ipcBus: any; // Need ipcBus types
}

export default class BaseModule {
  name: string;

  label: string;

  windowManager: WindowManager;

  ipcBus: any;

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
    type,
    width = 500,
    height = 500,
    html,
    onReady,
    onClosed,
    ...windowProps
  }: RegisterModuleWindowOptions) => {
    const win = this.windowManager.registerWindow({
      type,
      width,
      height,
      html,
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
