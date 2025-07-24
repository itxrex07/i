import fs from 'fs';
import path from 'path';
import { logger } from '../utils/utils.js';

export class ModuleManager {
  constructor(instagramBot = null) {
    this.instagramBot = instagramBot;
    this.modulesPath = './modules';
    this.modules = [];
    this.commandRegistry = null; // set in init()
  }

  async init() {
    const { Collection } = await import('../structures/Collection.js');
    this.commandRegistry = new Collection();
    await this.loadModules();
  }

  async loadModules() {
    try {
      const moduleFiles = fs.readdirSync(this.modulesPath)
        .filter(file => file.endsWith('.js'))
        .sort();

      for (const file of moduleFiles) {
        try {
          await this.loadModule(file);
        } catch (modErr) {
          logger.error(`❌ Module loading failed for ${file}: ${modErr.stack || modErr.message}`);
        }
      }

      this.buildCommandRegistry();
      logger.info(`🔌 Loaded ${this.modules.length} modules`);

    } catch (error) {
      logger.error('❌ Failed to load modules directory:', error.stack || error.message);
    }
  }

  async loadModule(filename) {
    const modulePath = path.join(this.modulesPath, filename);
    const moduleImport = await import(`../${modulePath}`);
    const ModuleClass = Object.values(moduleImport)[0];

    if (!ModuleClass || typeof ModuleClass !== 'function') {
      throw new Error(`No valid module class found in ${filename}`);
    }

    const moduleName = ModuleClass.name;
    const instance = (moduleName === 'HelpModule')
      ? new ModuleClass(this) // HelpModule receives ModuleManager
      : new ModuleClass(this.instagramBot);

    instance.moduleManager = this;
    this.modules.push(instance);
    logger.info(`📦 Loaded module: ${moduleName}`);
  }

  buildCommandRegistry() {
    if (!this.commandRegistry) {
      logger.warn('⚠️  Command registry not initialized. Skipping command registration.');
      return;
    }

    this.commandRegistry.clear();

    for (const module of this.modules) {
      const commands = module.getCommands?.() || {};
      for (const [name, command] of Object.entries(commands)) {
        this.commandRegistry.set(name.toLowerCase(), {
          ...command,
          module,
          moduleName: module.name || module.constructor.name.replace('Module', '').toLowerCase()
        });
      }
    }

    logger.info(`🎯 Registered ${this.commandRegistry.size} commands`);
  }

  getCommand(name) {
    return this.commandRegistry?.get(name.toLowerCase());
  }

  getAllCommands() {
    return this.commandRegistry || new Map();
  }

  getModule(name) {
    return this.modules.find(module =>
      module.constructor.name.toLowerCase().includes(name.toLowerCase()) ||
      (module.name && module.name.toLowerCase() === name.toLowerCase())
    );
  }

  async processMessage(message) {
    for (const module of this.modules) {
      try {
        if (typeof module.process === 'function') {
          message = await module.process(message);
        }
      } catch (error) {
        logger.error(`❌ Error in module ${module.name} process():`, error.stack || error.message);
      }
    }
    return message;
  }

  async cleanup() {
    for (const module of this.modules) {
      if (typeof module.cleanup === 'function') {
        try {
          await module.cleanup();
        } catch (error) {
          logger.error(`❌ Error in module ${module.name} cleanup():`, error.stack || error.message);
        }
      }
    }

    this.modules = [];
    if (this.commandRegistry) {
      this.commandRegistry.clear();
    }

    logger.info('🧹 Cleaned up all modules');
  }
}
