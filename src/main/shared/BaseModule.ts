export default class BaseModule {
  constructor({ name, windowManager, ipcBus }) {
    this.name = name;
    this.windowManager = windowManager;
    this.ipcBus = ipcBus;
  }

  registerModuleWindow = ({
    type,
    width = 500,
    height = 500,
    html,
    onReady,
    ...windowProps
  }) => {
    return this.windowManager.registerWindow({
      type,
      width,
      height,
      html,
      onReady: (_window) => {
        if (process.env.START_MODULE === this.name) {
          _window.show();
        }
      },
      ...windowProps,
    });
  };
}
