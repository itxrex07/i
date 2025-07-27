import { Client } from '../insta.js/src/index.js';
import { logger } from '../utils/utils.js';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';
// Note: tough-cookie import removed as we won't be manually setting cookies anymore.

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
   * Login to Instagram using session cookies (if valid) or credentials (fresh login).
   * Note: This method primarily relies on insta.js's internal login mechanism.
   * Manual cookie loading is complex due to insta.js's wrapper structure.
   */
  async login(username, password) {
    logger.info('🔑 Initializing Instagram client...');
    this.client = new Client({
      disableReplyPrefix: config.instagram.disableReplyPrefix || false,
    });

    this.setupEventHandlers();

    const sessionFile = path.resolve(`${username}.session.json`);
    let loggedIn = false;

    // Cleanup corrupted session files
    if (fs.existsSync(sessionFile)) {
      try {
        const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        // Basic check for validity based on insta.js Client serialization format
        if (!sessionData || typeof sessionData !== 'object' || !sessionData.constants || !sessionData.cookies) {
          logger.warn('🗑️ Session data appears invalid, removing session file');
          fs.unlinkSync(sessionFile);
        }
      } catch (e) {
        logger.warn('🗑️ Removing malformed session file');
        fs.unlinkSync(sessionFile);
      }
    }

    // 1. Try session.json (Primary method supported by insta.js)
    if (fs.existsSync(sessionFile)) {
      try {
        logger.info('🍪 Session file found — trying login via session...');
        const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

        // insta.js Client.login handles the full IgApiClient setup and state deserialization.
        // Pass the session data as the 'state' argument.
        await this.client.login(username, password, sessionData);
        // If login succeeds, this.client.user and this.client.ig should be set.
        if (this.client.user && this.client.ig) {
            logger.info(`✅ Logged in using session as @${this.client.user.username}`);
            loggedIn = true;
        } else {
             throw new Error('insta.js login with session succeeded but client state is incomplete.');
        }
      } catch (err) {
        logger.warn('⚠️ Failed to login with session:', err.message);
        // Remove corrupted session file
        try { fs.unlinkSync(sessionFile); } catch (e) { logger.warn('⚠️ Could not remove session file'); }
      }
    }

    // 2. Fresh login (if no session or session failed)
    // Note: We放弃 manual cookie loading (.cookies.json) as it conflicts with insta.js's internal state management.
    if (!loggedIn) {
        try {
          logger.info('🔑 Performing fresh login with credentials...');
          // This is the core method provided by insta.js.
          // It initializes this.client.ig, performs the login, fetches user data, loads threads, etc.
          await this.client.login(username, password);

          // Verify login was successful by checking if we have a user
          if (!this.client.user) {
            throw new Error('Login appeared successful but no user data received (client.user is null).');
          }
          // Verify internal client is ready
          if (!this.client.ig) {
             throw new Error('Login appeared successful but internal IgApiClient (client.ig) is null.');
          }

          logger.info(`✅ Logged in as @${this.client.user.username}`);

          // --- Save session after fresh login ---
          // Only attempt to save if the internal state seems valid.
          if (this.client.ig.state) {
              try {
                  const session = await this.client.ig.state.serialize();
                  // Add extra validation before writing
                  if (session && typeof session === 'object' && session.cookies && Array.isArray(session.cookies)) {
                      fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
                      logger.info('💾 session.json saved after fresh login');
                  } else {
                       logger.warn('⚠️ Serialized session data appears invalid, not saving.');
                  }
              } catch (serializeErr) {
                  logger.error('❌ Failed to serialize or save session after successful login:', serializeErr.message);
                  // Session saving failure is not critical for immediate operation.
              }
          } else {
               logger.warn('⚠️ Client internal IgApiClient state not available for session saving after login.');
          }
          // --- End Save Session ---

          loggedIn = true;
        } catch (error) {
          logger.error('❌ Fresh login failed:', error.message);
          // Log more details if available from the insta.js library or instagram-private-api
          if (error.response) {
             logger.error('❌ Login API response details:', JSON.stringify(error.response, null, 2));
          }
          // Re-throw as this is a critical failure for the login process
          throw error;
        }
    }

    if (loggedIn) {
        this.ready = true;
        this.running = true;
        await this.initializeModules();
        return true;
    } else {
        throw new Error('Unable to login using any available method.');
    }
  }


  /**
   * Setup event handlers for the client
   */
  setupEventHandlers() {
    // Ensure client is initialized before setting up handlers
    if (!this.client) {
      logger.error('❌ Cannot setup event handlers: client not initialized in InstagramBot');
      return;
    }

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
      logger.info('🚀 Instagram client connected successfully (from insta.js)');
    });

    this.client.on('error', (error) => {
      logger.error('🚨 Instagram client error (from insta.js):', error.message);
      // Consider adding more robust error handling/reconnection logic here if needed
    });

    this.client.on('disconnect', () => {
      logger.warn('🔌 Instagram client disconnected (from insta.js)');
      this.ready = false;
      // Consider adding reconnection logic here if needed
    });

    // Debug event from insta.js (if emitted)
    this.client.on('debug', (event, data) => {
       logger.debug(`🐛 insta.js debug event '${event}':`, data ? (typeof data === 'object' ? JSON.stringify(data, null, 2) : data) : 'No data');
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
      // Depending on your bot's requirements, you might want to throw this error
      // or allow partial startup.
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
    if (!this.client || !this.ready) {
        throw new Error('Cannot send message: Instagram client is not ready.');
    }
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
    if (!this.client || !this.ready) {
        throw new Error('Cannot send photo: Instagram client is not ready.');
    }
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
        await this.client.logout(); // This calls ig.account.logout(), ig.realtime.disconnect(), ig.fbns.disconnect()
      }

      logger.info('✅ Instagram bot disconnected successfully');
    } catch (error) {
      logger.error('❌ Error during disconnect:', error.message);
    }
  }
}
