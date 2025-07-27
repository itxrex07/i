// core/instagram-bot.js
import { Client } from '../insta.js/src/index.js';
import { logger } from '../utils/utils.js';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';
import tough from 'tough-cookie';

/**
 * Helper function to check if required cookies are present
 */
function hasRequiredCookies(rawCookies) {
  const required = ['sessionid', 'ds_user_id', 'csrftoken'];
  return required.every(name =>
    rawCookies.some(c => c.name === name && c.value)
  );
}

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

    // Initialize client here to ensure it's fresh for each login attempt
    this.client = new Client({
      disableReplyPrefix: config.instagram.disableReplyPrefix || false,
    });

    this.setupEventHandlers(); // Setup after client is initialized

    const sessionFile = path.resolve(`${username}.session.json`);
    const cookieFile = path.resolve(`${username}.cookies.json`);
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

    // 1. Try session.json
    if (fs.existsSync(sessionFile) && !loggedIn) {
      try {
        logger.info('🍪 Session file found — trying login via session...');
        const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        
        // Perform fresh login first to initialize this.client.ig
        // Then deserialize the state. This is a workaround because
        // insta.js Client.login handles the full setup.
        await this.client.login(username, password); // This initializes this.client.ig
        
        // Now attempt to deserialize the saved state over the fresh one
        // This might not work perfectly depending on insta.js internals,
        // but it's the correct object path.
        if (this.client.ig && this.client.ig.state) {
            await this.client.ig.state.deserialize(sessionData);
            // Re-fetch user info to ensure client.user is correctly populated
            // after state deserialization
            const currentUserResponse = await this.client.ig.user.info(this.client.ig.state.cookieUserId);
            const ClientUser = (await import('../insta.js/src/structures/ClientUser.js')).default;
            this.client.user = new ClientUser(this.client, currentUserResponse);
            this.client.cache.users.set(this.client.user.id, this.client.user);

            logger.info(`✅ Logged in using session as @${this.client.user.username}`);
            loggedIn = true;
        } else {
             throw new Error('Client internal IgApiClient not initialized after login for session restore.');
        }
      } catch (err) {
        logger.warn('⚠️ Failed to login with session:', err.message);
        // Remove corrupted session file
        try { fs.unlinkSync(sessionFile); } catch (e) { logger.warn('⚠️ Could not remove session file'); }
      }
    }

    // 2. Try cookies.json if session failed
    if (!loggedIn && fs.existsSync(cookieFile)) {
      try {
        logger.info('🍪 Loading raw cookies...');
        const rawCookies = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));

        // Validate required cookies exist
        if (!hasRequiredCookies(rawCookies)) {
          throw new Error('Missing required cookies: sessionid, ds_user_id, csrftoken');
        }

        // We need the IgApiClient to be initialized to load cookies.
        // The simplest way is to do a fresh login first, then override cookies.
        // This is a limitation of how insta.js wraps IgApiClient.
        logger.info('🔄 Performing initial login to initialize client state for cookie loading...');
        await this.client.login(username, password); // Initializes this.client.ig

        // Ensure client's internal IgApiClient state is ready
        if (!this.client.ig || !this.client.ig.state || !this.client.ig.state.cookieJar) {
          throw new Error('Client internal IgApiClient state not properly initialized for cookie loading after initial login.');
        }

        // Clear any existing cookies set by the initial login
        // Note: cookieJar.removeAllCookies() might be async or not exist, clear manually if needed.
        // For now, just set the desired cookies, which should overwrite.

        for (const cookie of rawCookies) {
          if (!cookie.name || !cookie.value || !cookie.domain) {
            logger.warn(`⚠️ Skipping invalid cookie: ${JSON.stringify(cookie)}`);
            continue;
          }

          const toughCookie = new tough.Cookie({
            key: cookie.name,
            value: cookie.value,
            domain: cookie.domain.replace(/^\./, ''),
            path: cookie.path || '/',
            secure: cookie.secure !== false,
            httpOnly: cookie.httpOnly !== false,
            expires: cookie.expirationDate ? new Date(cookie.expirationDate * 1000) : undefined,
          });

          const url = `https://${toughCookie.domain}${toughCookie.path}`;
          await this.client.ig.state.cookieJar.setCookie(toughCookie, url);
        }

        // Validate cookie-based session by fetching current user
        await this.client.ig.account.currentUser();
        // Re-fetch user info to ensure client.user is correctly populated
        const currentUserResponse = await this.client.ig.user.info(this.client.ig.state.cookieUserId);
        const ClientUser = (await import('../insta.js/src/structures/ClientUser.js')).default;
        this.client.user = new ClientUser(this.client, currentUserResponse);
        this.client.cache.users.set(this.client.user.id, this.client.user);

        logger.info(`✅ Logged in using raw cookies as @${this.client.user.username}`);

        // Save session from cookies for future use
        const session = await this.client.ig.state.serialize();
        fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
        logger.info('💾 session.json saved from cookie-based login');
        loggedIn = true;
      } catch (err) {
        logger.warn('⚠️ Failed to login with cookies.json:', err.message);
        // If cookie login fails after initial login, we might be in an inconsistent state.
        // Best to force a fresh login next time.
        try { fs.unlinkSync(sessionFile); } catch (e) { /* ignore */ }
        try { fs.unlinkSync(cookieFile); } catch (e) { /* ignore */ }
      }
    }

    // 3. Fresh login (if no session/cookies or if they failed)
    if (!loggedIn) {
      try {
        logger.info('🔑 Performing fresh login with credentials...');
        // The insta.js login method handles most of the setup
        await this.client.login(username, password);

        // Verify login was successful by checking if we have a user
        // The client.login method should have set this.client.user
        if (!this.client.user) {
          throw new Error('Login appeared successful but no user data received (client.user is null).');
        }

        logger.info(`✅ Logged in as @${this.client.user.username}`);

        // Save session after fresh login
        // Ensure this.client.ig is available before trying to serialize
        if (this.client.ig && this.client.ig.state) {
            const session = await this.client.ig.state.serialize();
            // Add extra validation before writing
            if (session && typeof session === 'object' && session.cookies && Array.isArray(session.cookies)) {
                fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
                logger.info('💾 session.json saved after fresh login');
            } else {
                 logger.warn('⚠️ Serialized session data appears invalid, not saving.');
            }
        } else {
             logger.warn('⚠️ Client internal IgApiClient state not available for session saving.');
        }
        loggedIn = true;
      } catch (error) {
        logger.error('❌ Login failed:', error.message);
        // Log more details if available
        if (error.response) {
           logger.error('❌ Login response details:', JSON.stringify(error.response, null, 2));
        }
        throw error; // Re-throw as this is a critical failure
      }
    }

    if (loggedIn) {
        this.ready = true;
        this.running = true;
        await this.initializeModules();
        return true;
    } else {
        throw new Error('Unable to login using any method');
    }
  }


  /**
   * Setup event handlers for the client
   */
  setupEventHandlers() {
    if (!this.client) {
      logger.error('❌ Cannot setup event handlers: client not initialized');
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

      if (this.client && this.client.ig) {
        await this.client.logout();
      }

      logger.info('✅ Instagram bot disconnected successfully');
    } catch (error) {
      logger.error('❌ Error during disconnect:', error.message);
    }
  }
}
