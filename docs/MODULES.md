# Module Development Guide

## Overview

The Hyper Insta bot uses a modular architecture that allows for easy extension and customization. Modules are self-contained units that provide specific functionality and can be loaded dynamically.

## Module Structure

### Basic Module Template

```javascript
export class MyModule {
  constructor(instagramBot = null) {
    // Module identification
    this.name = 'mymodule';
    this.description = 'Description of what this module does';
    
    // Reference to the main bot instance
    this.instagramBot = instagramBot;
    
    // Commands registry
    this.commands = {};
    
    // Setup commands
    this.setupCommands();
  }

  setupCommands() {
    this.commands['mycommand'] = {
      handler: this.handleMyCommand.bind(this),
      description: 'Command description',
      usage: '.mycommand <required> [optional]',
      adminOnly: false
    };
  }

  async handleMyCommand(args, message) {
    // Command implementation
    await message.reply('Command executed!');
  }

  getCommands() {
    return this.commands;
  }

  async process(message) {
    // Process all incoming messages
    // This runs for every message, not just commands
    return message;
  }

  async cleanup() {
    // Cleanup when module is unloaded
    // Close connections, clear intervals, etc.
  }
}
```

## Core Module Components

### 1. Constructor

The constructor initializes the module and sets up basic properties:

```javascript
constructor(instagramBot = null) {
  this.name = 'modulename';           // Unique module identifier
  this.description = 'Module desc';   // Human-readable description
  this.instagramBot = instagramBot;   // Reference to bot instance
  this.commands = {};                 // Commands registry
  
  // Module-specific properties
  this.config = {};
  this.cache = new Map();
  this.intervals = [];
  
  this.setupCommands();
}
```

### 2. Command Setup

Commands are defined in the `setupCommands()` method:

```javascript
setupCommands() {
  this.commands['commandname'] = {
    handler: this.handleCommand.bind(this),
    description: 'What this command does',
    usage: '.commandname <arg1> [arg2]',
    adminOnly: false,                    // Whether admin-only
    cooldown: 5000,                     // Cooldown in ms (optional)
    aliases: ['cmd', 'c']               // Command aliases (optional)
  };
}
```

### 3. Command Handlers

Command handlers receive arguments and the message object:

```javascript
async handleCommand(args, message) {
  // args: Array of command arguments
  // message: Message object with full context
  
  // Validate arguments
  if (!args[0]) {
    await message.reply('❌ Missing required argument');
    return;
  }
  
  // Process command
  const result = await this.doSomething(args[0]);
  
  // Send response
  await message.reply(`✅ Result: ${result}`);
}
```

### 4. Message Processing

The `process()` method runs for every message:

```javascript
async process(message) {
  // Log messages
  if (message.hasMedia) {
    console.log(`Media message from ${message.author.username}`);
  }
  
  // Modify message (optional)
  message.customProperty = 'value';
  
  // Always return the message
  return message;
}
```

## Advanced Features

### State Management

```javascript
export class StatefulModule {
  constructor() {
    this.name = 'stateful';
    this.userStates = new Map();
    this.globalConfig = {
      maxUsers: 100,
      timeout: 30000
    };
  }

  async handleStart(args, message) {
    const userId = message.author.id;
    
    this.userStates.set(userId, {
      step: 1,
      data: {},
      timestamp: Date.now()
    });
    
    await message.reply('Process started! What\'s your name?');
  }

  async process(message) {
    const userId = message.author.id;
    const state = this.userStates.get(userId);
    
    if (state && !message.content.startsWith('.')) {
      await this.handleStateMessage(message, state);
    }
    
    return message;
  }

  async handleStateMessage(message, state) {
    switch (state.step) {
      case 1:
        state.data.name = message.content;
        state.step = 2;
        await message.reply(`Hello ${state.data.name}! What's your age?`);
        break;
        
      case 2:
        state.data.age = parseInt(message.content);
        this.userStates.delete(message.author.id);
        await message.reply(`Thanks! Name: ${state.data.name}, Age: ${state.data.age}`);
        break;
    }
  }
}
```

### Database Integration

```javascript
export class DatabaseModule {
  constructor() {
    this.name = 'database';
    this.db = null;
  }

  async initialize() {
    // Initialize database connection
    this.db = await this.connectToDatabase();
  }

  async handleSave(args, message) {
    const data = args.join(' ');
    
    try {
      await this.db.collection('messages').insertOne({
        userId: message.author.id,
        content: data,
        timestamp: new Date()
      });
      
      await message.reply('✅ Data saved!');
    } catch (error) {
      await message.reply('❌ Failed to save data');
    }
  }

  async cleanup() {
    if (this.db) {
      await this.db.close();
    }
  }
}
```

### Event Handling

```javascript
export class EventModule {
  constructor(instagramBot) {
    this.name = 'events';
    this.instagramBot = instagramBot;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Listen to client events
    this.instagramBot.client.on('messageCreate', this.onMessage.bind(this));
    this.instagramBot.client.on('userFollow', this.onFollow.bind(this));
  }

  async onMessage(message) {
    if (message.mentions(this.instagramBot.client.user)) {
      await message.reply('You mentioned me!');
    }
  }

  async onFollow(user) {
    console.log(`New follower: ${user.username}`);
    
    // Send welcome message
    await user.send('Thanks for following!');
  }
}
```

### Scheduled Tasks

```javascript
export class SchedulerModule {
  constructor() {
    this.name = 'scheduler';
    this.intervals = [];
    this.setupScheduledTasks();
  }

  setupScheduledTasks() {
    // Run every hour
    const hourlyTask = setInterval(() => {
      this.performHourlyTask();
    }, 60 * 60 * 1000);
    
    this.intervals.push(hourlyTask);
    
    // Run daily at specific time
    this.scheduleDailyTask();
  }

  async performHourlyTask() {
    console.log('Running hourly maintenance...');
    // Cleanup, statistics, etc.
  }

  scheduleDailyTask() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // 9 AM
    
    const msUntilTomorrow = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.performDailyTask();
      
      // Schedule next day
      const dailyInterval = setInterval(() => {
        this.performDailyTask();
      }, 24 * 60 * 60 * 1000);
      
      this.intervals.push(dailyInterval);
    }, msUntilTomorrow);
  }

  async performDailyTask() {
    console.log('Running daily task...');
    // Send daily reports, cleanup old data, etc.
  }

  async cleanup() {
    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
  }
}
```

## Module Communication

### Inter-Module Communication

```javascript
export class CommunicationModule {
  constructor() {
    this.name = 'communication';
  }

  async handleGetStats(args, message) {
    // Get another module
    const coreModule = this.moduleManager.getModule('core');
    
    if (coreModule) {
      const stats = coreModule.getStats();
      await message.reply(`Stats: ${JSON.stringify(stats)}`);
    }
  }

  async handleBroadcast(args, message) {
    const messageText = args.join(' ');
    
    // Access all modules
    for (const module of this.moduleManager.modules) {
      if (module.onBroadcast) {
        await module.onBroadcast(messageText, message);
      }
    }
  }
}
```

### Shared Services

```javascript
// services/cache.js
export class CacheService {
  constructor() {
    this.cache = new Map();
  }

  set(key, value, ttl = 300000) { // 5 minutes default
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
}

// In module
import { CacheService } from '../services/cache.js';

export class CachedModule {
  constructor() {
    this.name = 'cached';
    this.cache = new CacheService();
  }

  async handleExpensiveOperation(args, message) {
    const cacheKey = `expensive_${args[0]}`;
    let result = this.cache.get(cacheKey);
    
    if (!result) {
      result = await this.performExpensiveOperation(args[0]);
      this.cache.set(cacheKey, result, 600000); // 10 minutes
    }
    
    await message.reply(`Result: ${result}`);
  }
}
```

## Best Practices

### 1. Error Handling

```javascript
async handleCommand(args, message) {
  try {
    // Command logic
    const result = await this.riskyOperation();
    await message.reply(`Success: ${result}`);
  } catch (error) {
    console.error(`Command error:`, error);
    await message.reply('❌ Something went wrong. Please try again.');
  }
}
```

### 2. Input Validation

```javascript
async handleUserInput(args, message) {
  // Check argument count
  if (args.length < 2) {
    await message.reply('❌ Usage: .command <arg1> <arg2>');
    return;
  }

  // Validate argument types
  const number = parseInt(args[0]);
  if (isNaN(number) || number < 1 || number > 100) {
    await message.reply('❌ First argument must be a number between 1-100');
    return;
  }

  // Sanitize string input
  const text = args[1].replace(/[<>]/g, '').trim();
  if (text.length === 0) {
    await message.reply('❌ Second argument cannot be empty');
    return;
  }

  // Process valid input
  await this.processInput(number, text, message);
}
```

### 3. Rate Limiting

```javascript
export class RateLimitedModule {
  constructor() {
    this.name = 'ratelimited';
    this.userCooldowns = new Map();
  }

  async handleCommand(args, message) {
    const userId = message.author.id;
    const cooldownTime = 10000; // 10 seconds
    
    const lastUsed = this.userCooldowns.get(userId);
    if (lastUsed && Date.now() - lastUsed < cooldownTime) {
      const remaining = Math.ceil((cooldownTime - (Date.now() - lastUsed)) / 1000);
      await message.reply(`⏰ Please wait ${remaining} seconds before using this command again.`);
      return;
    }

    this.userCooldowns.set(userId, Date.now());
    
    // Execute command
    await this.executeCommand(args, message);
  }
}
```

### 4. Configuration Management

```javascript
export class ConfigurableModule {
  constructor() {
    this.name = 'configurable';
    this.config = this.loadConfig();
  }

  loadConfig() {
    return {
      maxItems: process.env.MODULE_MAX_ITEMS || 10,
      timeout: parseInt(process.env.MODULE_TIMEOUT) || 30000,
      enableFeature: process.env.MODULE_ENABLE_FEATURE === 'true',
      apiKey: process.env.MODULE_API_KEY || null
    };
  }

  async handleConfigure(args, message) {
    if (args.length < 2) {
      const configStr = Object.entries(this.config)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      
      await message.reply(`Current configuration:\n${configStr}`);
      return;
    }

    const [key, value] = args;
    if (key in this.config) {
      this.config[key] = this.parseConfigValue(value);
      await message.reply(`✅ Updated ${key} to ${value}`);
    } else {
      await message.reply(`❌ Unknown configuration key: ${key}`);
    }
  }

  parseConfigValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(value)) return parseInt(value);
    return value;
  }
}
```

## Testing Modules

### Unit Testing

```javascript
// tests/modules/mymodule.test.js
import { MyModule } from '../../modules/mymodule.js';

describe('MyModule', () => {
  let module;
  let mockMessage;

  beforeEach(() => {
    module = new MyModule();
    mockMessage = {
      reply: jest.fn(),
      author: { id: 'test_user', username: 'testuser' },
      content: 'test message'
    };
  });

  test('should handle command correctly', async () => {
    await module.handleMyCommand(['arg1'], mockMessage);
    
    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('Command executed')
    );
  });

  test('should process messages', async () => {
    const result = await module.process(mockMessage);
    
    expect(result).toBe(mockMessage);
  });
});
```

### Integration Testing

```javascript
// tests/integration/module-integration.test.js
import { InstagramBot } from '../../core/bot.js';
import { ModuleManager } from '../../core/module-manager.js';

describe('Module Integration', () => {
  let bot;
  let moduleManager;

  beforeEach(async () => {
    bot = new InstagramBot();
    moduleManager = new ModuleManager(bot);
    await moduleManager.loadModules();
  });

  test('should load all modules', () => {
    expect(moduleManager.modules.length).toBeGreaterThan(0);
  });

  test('should register commands', () => {
    const commands = moduleManager.getAllCommands();
    expect(commands.size).toBeGreaterThan(0);
  });
});
```

## Deployment

### Module Distribution

1. **Single File Modules**: Simple modules in one file
2. **Package Modules**: Complex modules with multiple files
3. **NPM Modules**: Publishable modules for sharing

### Loading External Modules

```javascript
// config.js
export const config = {
  modules: {
    autoLoad: true,
    modulesPath: './modules',
    externalModules: [
      'hyper-insta-weather',
      'hyper-insta-translator'
    ]
  }
};
```

This comprehensive guide should help you create powerful, maintainable modules for the Hyper Insta bot. Remember to follow the established patterns and best practices for consistency and reliability.