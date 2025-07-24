import TelegramBot from 'node-telegram-bot-api';
import { logger } from '../utils/utils.js';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';

export class TelegramBotManager {
  constructor(instagramBot = null) {
    this.bot = null;
    this.instagramBot = instagramBot;
    this.authorizedUsers = new Set();
    this.pendingAuth = new Map();
    this.isInitialized = false;
    this.commands = new Map();
    this.setupCommands();
  }

  async initialize() {
    if (!config.telegram.botToken) {
      logger.warn('⚠️ Telegram bot token not provided, skipping Telegram initialization');
      return false;
    }

    try {
      this.bot = new TelegramBot(config.telegram.botToken, { polling: true });
      this.setupEventHandlers();
      this.isInitialized = true;
      logger.info('✅ Telegram bot initialized successfully');
      return true;
    } catch (error) {
      logger.error('❌ Failed to initialize Telegram bot:', error.message);
      return false;
    }
  }

  setupCommands() {
    this.commands.set('start', {
      handler: this.handleStart.bind(this),
      description: '🚀 Start the bot and authenticate',
      requireAuth: false
    });

    this.commands.set('help', {
      handler: this.handleHelp.bind(this),
      description: '📋 Show all available commands',
      requireAuth: false
    });

    this.commands.set('auth', {
      handler: this.handleAuth.bind(this),
      description: '🔐 Authenticate with password',
      requireAuth: false
    });

    this.commands.set('status', {
      handler: this.handleStatus.bind(this),
      description: '📊 Show Instagram bot status',
      requireAuth: true
    });

    this.commands.set('cookies', {
      handler: this.handleCookies.bind(this),
      description: '🍪 Manage Instagram cookies',
      requireAuth: true
    });

    this.commands.set('login', {
      handler: this.handleLogin.bind(this),
      description: '🔑 Login to Instagram with credentials',
      requireAuth: true
    });

    this.commands.set('bridge', {
      handler: this.handleBridge.bind(this),
      description: '🌉 Manage Instagram-Telegram bridge',
      requireAuth: true
    });

    this.commands.set('typing', {
      handler: this.handleTyping.bind(this),
      description: '⌨️ Control typing indicators',
      requireAuth: true
    });

    this.commands.set('seen', {
      handler: this.handleSeen.bind(this),
      description: '👁️ Control message seen status',
      requireAuth: true
    });

    this.commands.set('presence', {
      handler: this.handlePresence.bind(this),
      description: '🟢 Control online presence',
      requireAuth: true
    });

    this.commands.set('scrape', {
      handler: this.handleScrape.bind(this),
      description: '🕷️ Scrape Instagram data',
      requireAuth: true
    });
  }

  setupEventHandlers() {
    this.bot.on('message', async (msg) => {
      try {
        await this.handleMessage(msg);
      } catch (error) {
        logger.error('Telegram message error:', error.message);
      }
    });

    this.bot.on('document', async (msg) => {
      if (this.isAuthorized(msg.from.id)) {
        await this.handleDocument(msg);
      }
    });

    this.bot.on('callback_query', async (query) => {
      await this.handleCallbackQuery(query);
    });

    this.bot.on('error', (error) => {
      logger.error('Telegram bot error:', error.message);
    });
  }

  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (!text || !text.startsWith('/')) return;

    const [command, ...args] = text.slice(1).split(' ');
    const cmd = this.commands.get(command.toLowerCase());

    if (!cmd) {
      await this.bot.sendMessage(chatId, '❌ Unknown command. Use /help to see available commands.');
      return;
    }

    if (cmd.requireAuth && !this.isAuthorized(userId)) {
      await this.bot.sendMessage(chatId, '🔒 You need to authenticate first. Use /start to begin.');
      return;
    }

    await cmd.handler(msg, args);
  }

  async handleStart(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (this.isAuthorized(userId)) {
      await this.sendStatusMessage(chatId);
      return;
    }

    const keyboard = {
      inline_keyboard: [[
        { text: '🔐 Authenticate', callback_data: 'auth_start' }
      ]]
    };

    await this.bot.sendMessage(chatId, `
🚀 **HyperInsta Telegram Controller**

Welcome! This bot allows you to control your Instagram bot remotely.

🔒 **Authentication Required**
To use this bot, you need to authenticate with the admin password.

Click the button below to start authentication.
    `, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async handleAuth(msg, args) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const password = args.join(' ');

    if (!password) {
      await this.bot.sendMessage(chatId, '🔐 Please provide the password: /auth <password>');
      return;
    }

    if (password === config.telegram.adminPassword) {
      this.authorizedUsers.add(userId);
      await this.bot.sendMessage(chatId, '✅ Authentication successful! You now have access to all commands.');
      await this.sendStatusMessage(chatId);
    } else {
      await this.bot.sendMessage(chatId, '❌ Invalid password. Access denied.');
    }
  }

  async handleStatus(msg) {
    await this.sendStatusMessage(msg.chat.id);
  }

  async sendStatusMessage(chatId) {
    const instagramStatus = this.instagramBot ? this.instagramBot.getStats() : null;
    
    let statusText = `📊 **HyperInsta Status**\n\n`;
    
    if (instagramStatus) {
      statusText += `✅ **Instagram Bot**: ${instagramStatus.ready ? 'Connected' : 'Disconnected'}\n`;
      statusText += `👤 **Username**: @${instagramStatus.username || 'Unknown'}\n`;
      statusText += `💬 **Chats**: ${instagramStatus.chats}\n`;
      statusText += `📦 **Modules**: ${instagramStatus.modules}\n`;
      statusText += `⚡ **Commands**: ${instagramStatus.commands}\n`;
      statusText += `🕒 **Uptime**: ${this.formatUptime(instagramStatus.uptime)}\n`;
    } else {
      statusText += `❌ **Instagram Bot**: Not Connected\n`;
    }

    statusText += `\n🤖 **Telegram Bot**: Active\n`;
    statusText += `🔐 **Authorized**: Yes\n`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔄 Refresh', callback_data: 'refresh_status' },
          { text: '🍪 Cookies', callback_data: 'manage_cookies' }
        ],
        [
          { text: '🌉 Bridge', callback_data: 'manage_bridge' },
          { text: '⚙️ Settings', callback_data: 'bot_settings' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, statusText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async handleCookies(msg, args) {
    const chatId = msg.chat.id;
    const action = args[0];

    if (!action) {
      const keyboard = {
        inline_keyboard: [
          [
            { text: '📤 Export Cookies', callback_data: 'cookies_export' },
            { text: '📥 Import Cookies', callback_data: 'cookies_import' }
          ],
          [
            { text: '🗑️ Clear Cookies', callback_data: 'cookies_clear' }
          ]
        ]
      };

      await this.bot.sendMessage(chatId, `
🍪 **Cookie Management**

Choose an action:
• Export: Download current cookies as file
• Import: Upload cookies file to login
• Clear: Remove all saved cookies
      `, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      return;
    }

    switch (action) {
      case 'export':
        await this.exportCookies(chatId);
        break;
      case 'clear':
        await this.clearCookies(chatId);
        break;
    }
  }

  async handleLogin(msg, args) {
    const chatId = msg.chat.id;
    
    if (args.length < 2) {
      await this.bot.sendMessage(chatId, '🔑 Usage: /login <username> <password>');
      return;
    }

    const [username, password] = args;
    
    try {
      await this.bot.sendMessage(chatId, '🔄 Attempting to login to Instagram...');
      
      if (this.instagramBot) {
        await this.instagramBot.login(username, password);
        await this.bot.sendMessage(chatId, '✅ Successfully logged in to Instagram!');
      } else {
        await this.bot.sendMessage(chatId, '❌ Instagram bot not available');
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `❌ Login failed: ${error.message}`);
    }
  }

  async handleBridge(msg, args) {
    const chatId = msg.chat.id;
    const action = args[0];

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🟢 Enable Bridge', callback_data: 'bridge_enable' },
          { text: '🔴 Disable Bridge', callback_data: 'bridge_disable' }
        ],
        [
          { text: '📊 Bridge Status', callback_data: 'bridge_status' },
          { text: '⚙️ Bridge Settings', callback_data: 'bridge_settings' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, `
🌉 **Instagram-Telegram Bridge**

The bridge allows bidirectional message forwarding between Instagram and Telegram.

Features:
• Auto-create topics for each Instagram chat
• Forward messages, media, voice notes
• Send messages from Telegram to Instagram
• Thread mapping and management
    `, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async handleDocument(msg) {
    const chatId = msg.chat.id;
    const document = msg.document;

    if (document.file_name?.endsWith('_cookies.json')) {
      try {
        const file = await this.bot.getFile(document.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
        
        // Download and save cookies
        const response = await fetch(fileUrl);
        const cookieData = await response.text();
        
        const cookiesPath = './session/session_cookies.json';
        fs.writeFileSync(cookiesPath, cookieData);
        
        await this.bot.sendMessage(chatId, '✅ Cookies imported successfully! You can now try logging in.');
      } catch (error) {
        await this.bot.sendMessage(chatId, `❌ Failed to import cookies: ${error.message}`);
      }
    }
  }

  async handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    const data = query.data;

    await this.bot.answerCallbackQuery(query.id);

    switch (data) {
      case 'auth_start':
        await this.bot.sendMessage(chatId, '🔐 Please send the admin password using: /auth <password>');
        break;
      case 'refresh_status':
        await this.sendStatusMessage(chatId);
        break;
      case 'cookies_export':
        await this.exportCookies(chatId);
        break;
      case 'cookies_import':
        await this.bot.sendMessage(chatId, '📥 Please send your cookies file (must end with _cookies.json)');
        break;
      case 'cookies_clear':
        await this.clearCookies(chatId);
        break;
      case 'bridge_enable':
        await this.enableBridge(chatId);
        break;
      case 'bridge_disable':
        await this.disableBridge(chatId);
        break;
    }
  }

  async exportCookies(chatId) {
    try {
      const cookiesPath = './session/session_cookies.json';
      
      if (!fs.existsSync(cookiesPath)) {
        await this.bot.sendMessage(chatId, '❌ No cookies found to export.');
        return;
      }

      await this.bot.sendDocument(chatId, cookiesPath, {
        caption: '🍪 Instagram cookies exported successfully!'
      });
    } catch (error) {
      await this.bot.sendMessage(chatId, `❌ Failed to export cookies: ${error.message}`);
    }
  }

  async clearCookies(chatId) {
    try {
      const cookiesPath = './session/session_cookies.json';
      
      if (fs.existsSync(cookiesPath)) {
        fs.unlinkSync(cookiesPath);
      }

      await this.bot.sendMessage(chatId, '✅ Cookies cleared successfully!');
    } catch (error) {
      await this.bot.sendMessage(chatId, `❌ Failed to clear cookies: ${error.message}`);
    }
  }

  async enableBridge(chatId) {
    // Implementation for enabling bridge
    await this.bot.sendMessage(chatId, '✅ Instagram-Telegram bridge enabled!');
  }

  async disableBridge(chatId) {
    // Implementation for disabling bridge
    await this.bot.sendMessage(chatId, '🔴 Instagram-Telegram bridge disabled!');
  }

  isAuthorized(userId) {
    return this.authorizedUsers.has(userId);
  }

  formatUptime(uptime) {
    if (!uptime) return 'Unknown';
    
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  async sendMessage(chatId, text, options = {}) {
    if (!this.bot) return;
    return await this.bot.sendMessage(chatId, text, options);
  }

  async handleHelp(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    let helpText = `📋 **Available Commands**\n\n`;
    
    for (const [name, cmd] of this.commands) {
      if (!cmd.requireAuth || this.isAuthorized(userId)) {
        helpText += `/${name} - ${cmd.description}\n`;
      }
    }

    if (!this.isAuthorized(userId)) {
      helpText += `\n🔒 More commands available after authentication.`;
    }

    await this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
  }

  async handleTyping(msg, args) {
    const chatId = msg.chat.id;
    const action = args[0];

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🟢 Enable Auto-Typing', callback_data: 'typing_enable' },
          { text: '🔴 Disable Auto-Typing', callback_data: 'typing_disable' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, `
⌨️ **Typing Indicator Control**

Control when the bot shows typing indicators in Instagram chats.
    `, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async handleSeen(msg, args) {
    const chatId = msg.chat.id;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '👁️ Enable Auto-Seen', callback_data: 'seen_enable' },
          { text: '🙈 Disable Auto-Seen', callback_data: 'seen_disable' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, `
👁️ **Message Seen Control**

Control when the bot marks Instagram messages as seen.
    `, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async handlePresence(msg, args) {
    const chatId = msg.chat.id;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🟢 Online', callback_data: 'presence_online' },
          { text: '🟡 Away', callback_data: 'presence_away' }
        ],
        [
          { text: '🔴 Offline', callback_data: 'presence_offline' },
          { text: '👻 Invisible', callback_data: 'presence_invisible' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, `
🟢 **Presence Control**

Control your online status on Instagram.
    `, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async handleScrape(msg, args) {
    const chatId = msg.chat.id;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '👤 Scrape Profile', callback_data: 'scrape_profile' },
          { text: '👥 Scrape Followers', callback_data: 'scrape_followers' }
        ],
        [
          { text: '📸 Scrape Posts', callback_data: 'scrape_posts' },
          { text: '📊 Scrape Stories', callback_data: 'scrape_stories' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, `
🕷️ **Instagram Scraping Tools**

Extract data from Instagram profiles, posts, and more.
    `, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
}
