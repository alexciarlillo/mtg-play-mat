export default class BaseModule {
  constructor({ name, label, windowManager, ipcBus }) {
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
  }) => {
    const win = this.windowManager.registerWindow({
      type,
      width,
      height,
      html,
      onReady: (_window) => {
        onReady?.({ window: _window });
      },
      onClosed: ({ windowId }) => {
        delete this.windowsById[windowId];
        onClosed?.({ windowId });
      },
      ...windowProps,
    });

    this.windowsById[win.id] = win;

    return win;
  };
}
