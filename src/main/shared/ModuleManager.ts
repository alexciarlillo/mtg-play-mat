import type BaseModule from './BaseModule';

export default class ModuleManager {
  modules: Record<string, BaseModule> = {};

  registerModule = (module: BaseModule) => {
    if (this.modules[module.name]) {
      throw new Error(`Module ${module.name} already registered`);
    }

    this.modules[module.name] = module;
  };
}
