export default class ModuleManager {
  constructor() {
    this.modules = {};
  }

  registerModule = (module) => {
    if (this.modules[module.name]) {
      throw new Error(`Module ${module.name} already registered`);
    }

    this.modules[module.name] = module;
  };

  open = ({ moduleName }) => {};

  close = ({ moduleName }) => {};

  reload = ({ moduleName }) => {};
}
