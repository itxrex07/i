import { Client } from '../insta.js/src/index.js';
import { logger } from '../utils/utils.js';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';
import { readFileSync } from 'fs';
import { CookieJar } from 'tough-cookie'; // add this import


/**
 * Instagram Bot using original insta.js framework
 */
export class InstagramBot {
  constructor() {
    this.client = null;
    this.ready = false;
    this.running = false;
    this.startTime = new Date();
    this.messageCount = 0;
    this.commandCount = 0;
    this.moduleManager = null;
    this.messageHandler = null;
    this.telegramBridge = null;
  }

/**
 * Login to Instagram using session cookies or credentials
 */
async login(username, password) {
  logger.info('🔑 Initializing Instagram client...');

  this.client = new Client({
    disableReplyPrefix: config.instagram.disableReplyPrefix || false,
  });

  this.setupEventHandlers();

const sessionFile = path.resolve(`${username}.session.json`);
let loggedIn = false;

try {
  if (fs.existsSync(sessionFile)) {
    logger.info('🍪 Session file found — injecting raw cookies...');
    const rawCookies = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

    const cookieJar = this.client.state.cookieJar;
    for (const cookie of rawCookies) {
      const cookieStr = `${cookie.name}=${cookie.value}`;
      await cookieJar.setCookie(cookieStr, `https://instagram.com`, { http: true });
    }

    await this.client.simulate.preLoginFlow();
    await this.client.account.currentUser(); // validate session
    await this.client.simulate.postLoginFlow();

    logger.info(`✅ Logged in using session cookies as @${this.client.user.username}`);
    loggedIn = true;
  }
} catch (err) {
  logger.warn('⚠️ Failed to login with session cookies, falling back to username/password...');
}

  if (!loggedIn) {
    try {
      await this.client.login(username, password);

      logger.info(`✅ Logged in with credentials as @${this.client.user.username}`);

      // Save session
      fs.writeFileSync(sessionFile, JSON.stringify(await this.client.state.serialize()));
      logger.info('💾 Session saved for future use');
    } catch (error) {
      logger.error('❌ Login failed:', error.message);
      throw error;
    }
  }

  this.ready = true;
  this.running = true;

  await this.initializeModules();
  return true;
}


  /**
   * Setup event handlers for the client
   */
  setupEventHandlers() {
    // Message events
    this.client.on('messageCreate', async (message) => {
      try {
        this.messageCount++;
        logger.debug(`📨 New message from @${message.author?.username}: ${message.content || '[Media]'}`);
        
        // Handle through message handler
        if (this.messageHandler) {
          await this.messageHandler.handleMessage(message);
        }

        // Forward to Telegram bridge if enabled
        if (this.telegramBridge && config.telegram.forwardMessages) {
          await this.telegramBridge.forwardToTelegram(message);
        }
      } catch (error) {
        logger.error('❌ Error handling message:', error.message);
      }
    });

    // Pending request events
    this.client.on('pendingRequest', async (chat) => {
      try {
        logger.info(`📬 New pending request from: ${chat.name || chat.id}`);
        
        // Auto-approve if enabled in config
        if (config.instagram.autoApprovePending) {
          await chat.approve();
          logger.info(`✅ Auto-approved pending request: ${chat.id}`);
          
          // Notify via Telegram if bridge is enabled
          if (this.telegramBridge) {
            await this.telegramBridge.notifyPendingRequest(chat, 'approved');
          }
        } else if (this.telegramBridge) {
          // Just notify via Telegram
          await this.telegramBridge.notifyPendingRequest(chat, 'pending');
        }
      } catch (error) {
        logger.error('❌ Error handling pending request:', error.message);
      }
    });

    // New follower events
    this.client.on('newFollower', async (user) => {
      logger.info(`👤 New follower: @${user.username}`);
      
      if (this.telegramBridge) {
        await this.telegramBridge.notifyNewFollower(user);
      }
    });

    // Follow request events
    this.client.on('followRequest', async (user) => {
      logger.info(`👤 Follow request from: @${user.username}`);
      
      // Auto-approve follow requests if enabled
      if (config.instagram.autoApproveFollowRequests) {
        await user.approveFollow();
        logger.info(`✅ Auto-approved follow request from @${user.username}`);
      }
      
      if (this.telegramBridge) {
        await this.telegramBridge.notifyFollowRequest(user);
      }
    });

    // Connection events
    this.client.on('connected', () => {
      logger.info('🚀 Instagram client connected successfully');
    });

    this.client.on('error', (error) => {
      logger.error('🚨 Instagram client error:', error.message);
    });

    this.client.on('disconnect', () => {
      logger.warn('🔌 Instagram client disconnected');
      this.ready = false;
    });
  }

  /**
   * Initialize modules after login
   */
  async initializeModules() {
    try {
      const { ModuleManager } = await import('./module-manager.js');
      const { MessageHandler } = await import('./message-handler.js');

      // Initialize module manager
      this.moduleManager = new ModuleManager(this);
      await this.moduleManager.init();

      // Initialize message handler
      this.messageHandler = new MessageHandler(this, this.moduleManager, this.telegramBridge);

      logger.info('✅ Modules initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize modules:', error.message);
    }
  }

  /**
   * Set Telegram bridge
   */
  setTelegramBridge(bridge) {
    this.telegramBridge = bridge;
    if (this.messageHandler) {
      this.messageHandler.telegramBridge = bridge;
    }
  }

  /**
   * Send message to a chat
   */
  async sendMessage(chatId, content, options = {}) {
    try {
      const chat = await this.client.fetchChat(chatId);
      return await chat.sendMessage(content);
    } catch (error) {
      logger.error('❌ Failed to send message:', error.message);
      throw error;
    }
  }

  /**
   * Send photo to a chat
   */
  async sendPhoto(chatId, attachment, caption = '') {
    try {
      const chat = await this.client.fetchChat(chatId);
      const message = await chat.sendPhoto(attachment);
      
      if (caption) {
        await chat.sendMessage(caption);
      }
      
      return message;
    } catch (error) {
      logger.error('❌ Failed to send photo:', error.message);
      throw error;
    }
  }

  /**
   * Get bot statistics
   */
  getStats() {
    return {
      ready: this.ready,
      running: this.running,
      username: this.client?.user?.username,
      userId: this.client?.user?.id,
      uptime: Date.now() - this.startTime.getTime(),
      messageCount: this.messageCount,
      commandCount: this.commandCount,
      modules: this.moduleManager?.modules?.length || 0,
      commands: this.moduleManager?.commandRegistry?.size || 0,
      client: {
        users: this.client?.cache?.users?.size || 0,
        chats: this.client?.cache?.chats?.size || 0,
        messages: this.client?.cache?.messages?.size || 0,
        pendingChats: this.client?.cache?.pendingChats?.size || 0
      }
    };
  }

  /**
   * Disconnect from Instagram
   */
  async disconnect() {
    try {
      this.running = false;
      this.ready = false;
      
      if (this.client) {
        await this.client.logout();
      }
      
      logger.info('✅ Instagram bot disconnected successfully');
    } catch (error) {
      logger.error('❌ Error during disconnect:', error.message);
    }
  }
}
