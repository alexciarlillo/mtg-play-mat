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

  get moduleList() {
    return Object.values(this.modules).map(({ name, label }) => ({
      name,
      label,
    }));
  }

  open = ({ moduleName }) => {};

  close = ({ moduleName }) => {};

  reload = ({ moduleName }) => {};
}
