import { IgApiClient } from 'instagram-private-api';
import { withRealtime } from 'instagram_mqtt';
import { EventEmitter } from 'events';
import fs from 'fs';
import tough from 'tough-cookie';
import { Collection } from '../structures/Collection.js';
import User from '../structures/User.js';

import { Chat } from '../structures/Chat.js';
import { Message } from '../structures/Message.js';
import { logger } from '../utils/utils.js';

/**
 * Enhanced Instagram client with rich object support
 * @extends {EventEmitter}
 */
export class InstagramClient extends EventEmitter {
  constructor(options = {}) {
    super();

    /**
     * Client options
     * @type {Object}
     */
    this.options = {
      disableReplyPrefix: false,
      sessionPath: './session/session.json',
      messageCheckInterval: 5000,
      maxRetries: 3,
      autoReconnect: true,
      ...options
    };

    /**
     * Instagram API client
     * @type {IgApiClient}
     */
    this.ig = withRealtime(new IgApiClient());

    /**
     * Bot user object
     * @type {User|null}
     */
    this.user = null;

    /**
     * Whether the client is ready
     * @type {boolean}
     */
    this.ready = false;

    /**
     * Whether the client is running
     * @type {boolean}
     */
    this.running = false;

    /**
     * Cache for users, chats, and messages
     * @type {Object}
     */
    this.cache = {
      users: new Collection(),
      chats: new Collection(),
      pendingChats: new Collection(),
      messages: new Collection()
    };

    /**
     * Last message check timestamp
     * @type {Date}
     */
    this.lastMessageCheck = new Date(Date.now() - 60000);

    /**
     * Events to replay after ready
     * @type {Array}
     * @private
     */
    this._eventsToReplay = [];

    /**
     * Connection retry count
     * @type {number}
     * @private
     */
    this._retryCount = 0;
  }

  /**
   * Login to Instagram
   * @param {string} username - Instagram username
   * @param {string} password - Instagram password
   * @returns {Promise<void>}
   */


async login(username) {
  try {
    logger.info('🔐 Starting login process...');

    // Step 1: Generate device
    this.ig.state.generateDevice(username);

    // Step 2: Try loading session.json first
    if (fs.existsSync('./session.json')) {
      logger.info('📂 Found session.json, trying to login from session...');
      const sessionData = JSON.parse(fs.readFileSync('./session.json', 'utf-8'));
      await this.ig.state.deserialize(sessionData);

      // Validate session
      await this.ig.account.currentUser();
      logger.info('✅ Logged in from session.json');
    } else {
      // Step 3: Try cookies.json if session not available
      logger.info('📂 session.json not found, trying cookies.json...');
      await this._loadCookies();

      // Validate cookies
      await this.ig.account.currentUser();
      logger.info('✅ Logged in using cookies.json');

      // Save session for future use
      await this._saveSession();
      logger.info('💾 session.json saved from cookie-based login');
    }

    // Step 4: Load user info
    const userInfo = await this.ig.account.currentUser();
    this.user = this._patchOrCreateUser(userInfo.pk, userInfo);

    // Step 5: Load chats
    await this._loadChats();

    // Step 6: Setup handlers
    this._setupRealtimeHandlers();

    // Step 7: Connect realtime
    await this.ig.realtime.connect({
      autoReconnect: this.options.autoReconnect,
      irisData: await this.ig.feed.directInbox().request()
    });

    this.ready = true;
    this.running = true;
    this._retryCount = 0;

    logger.info(`🚀 Connected as @${this.user.username} (ID: ${this.user.id})`);
    this.emit('ready');

    // Step 8: Replay any queued events
    this._replayEvents();

  } catch (error) {
    logger.error('❌ Login failed:', error.message);
    throw new Error('🚫 Could not login via session or cookies');
  }
}

/**
 * Save full session state (cookies + device)
 * @returns {Promise<void>}
 */
async _saveSession() {
  const state = await this.ig.state.serialize();
  delete state.constants;
  fs.writeFileSync('./session.json', JSON.stringify(state, null, 2));
}


  /**
   * Disconnect from Instagram
   * @returns {Promise<void>}
   */
  async disconnect() {
    logger.info('🔌 Disconnecting from Instagram...');
    
    this.running = false;
    this.ready = false;

    try {
      if (this.ig.realtime) {
        await this.ig.realtime.disconnect();
      }
      logger.info('✅ Disconnected successfully');
    } catch (error) {
      logger.warn('⚠️ Error during disconnect:', error.message);
    }

    this.emit('disconnect');
  }

  /**
   * Create or get a user object
   * @param {string} userId - User ID
   * @param {Object} userData - User data from API
   * @returns {User}
   * @private
   */
  _patchOrCreateUser(userId, userData) {
    if (this.cache.users.has(userId)) {
      this.cache.users.get(userId)._patch(userData);
    } else {
      this.cache.users.set(userId, new User(this, userData));
    }
    return this.cache.users.get(userId);
  }

  /**
   * Create a message object
   * @param {string} chatId - Chat ID
   * @param {Object} messageData - Message data from API
   * @returns {Message}
   * @private
   */
  _createMessage(chatId, messageData) {
    const message = new Message(this, chatId, messageData);
    this.cache.messages.set(message.id, message);
    return message;
  }

  /**
   * Fetch a user by ID or username
   * @param {string} query - User ID or username
   * @param {boolean} force - Force fetch from API
   * @returns {Promise<User>}
   */
  async fetchUser(query, force = false) {
    const isId = /^\d+$/.test(query);
    const userId = isId ? query : await this.ig.user.getIdByUsername(query);

    if (!this.cache.users.has(userId) || force) {
      const userData = await this.ig.user.info(userId);
      this._patchOrCreateUser(userId, userData);
    }

    return this.cache.users.get(userId);
  }

  /**
   * Fetch a chat by ID
   * @param {string} chatId - Chat ID
   * @param {boolean} force - Force fetch from API
   * @returns {Promise<Chat>}
   */
  async fetchChat(chatId, force = false) {
    if (!this.cache.chats.has(chatId) || force) {
      const { thread: chatData } = await this.ig.feed.directThread({ thread_id: chatId }).request();
      
      if (!this.cache.chats.has(chatId)) {
        this.cache.chats.set(chatId, new Chat(this, chatId, chatData));
      } else {
        this.cache.chats.get(chatId)._patch(chatData);
      }
    }

    return this.cache.chats.get(chatId);
  }

  /**
   * Create a new chat
   * @param {string[]} userIds - User IDs to include
   * @returns {Promise<Chat>}
   */
  async createChat(userIds) {
    const threadData = await this.ig.direct.createGroupThread(userIds);
    const chat = new Chat(this, threadData.thread_id, threadData);
    this.cache.chats.set(chat.id, chat);
    return chat;
  }

  /**
   * Load existing chats
   * @returns {Promise<void>}
   * @private
   */
  async _loadChats() {
    try {
      const [inbox, pending] = await Promise.all([
        this.ig.feed.directInbox().items(),
        this.ig.feed.directPending().items()
      ]);

      // Load inbox chats
      for (const thread of inbox) {
        const chat = new Chat(this, thread.thread_id, thread);
        this.cache.chats.set(chat.id, chat);
      }

      // Load pending chats
      for (const thread of pending) {
        const chat = new Chat(this, thread.thread_id, thread);
        this.cache.chats.set(chat.id, chat);
        this.cache.pendingChats.set(chat.id, chat);
      }

      logger.info(`📥 Loaded ${inbox.length} chats and ${pending.length} pending chats`);
    } catch (error) {
      logger.error('❌ Failed to load chats:', error.message);
    }
  }

  /**
   * Setup realtime event handlers
   * @private
   */
  _setupRealtimeHandlers() {
    logger.info('📡 Setting up realtime handlers...');

    // Main message handler
    this.ig.realtime.on('message', async (data) => {
      try {
        if (!this.ready) {
          this._eventsToReplay.push(['message', data]);
          return;
        }

        if (!data.message || !this._isNewMessage(data.message)) {
          return;
        }

        await this._handleMessage(data.message, data);
      } catch (error) {
        logger.error('❌ Message handler error:', error.message);
      }
    });

    // Direct events handler
    this.ig.realtime.on('direct', async (data) => {
      try {
        if (!this.ready) {
          this._eventsToReplay.push(['direct', data]);
          return;
        }

        if (data.message && this._isNewMessage(data.message)) {
          await this._handleMessage(data.message, data);
        }
      } catch (error) {
        logger.error('❌ Direct handler error:', error.message);
      }
    });

    // Connection events
    this.ig.realtime.on('error', (error) => {
      logger.error('🚨 Realtime error:', error.message);
      this.emit('error', error);
      
      if (this.options.autoReconnect && this._retryCount < this.options.maxRetries) {
        this._attemptReconnect();
      }
    });

    this.ig.realtime.on('close', () => {
      logger.warn('🔌 Realtime connection closed');
      this.emit('disconnect');
      
      if (this.running && this.options.autoReconnect) {
        this._attemptReconnect();
      }
    });

    // Debug events
    this.ig.realtime.on('receive', (topic, messages) => {
      const topicStr = String(topic || '');
      if (topicStr.includes('direct') || topicStr.includes('message')) {
        logger.debug(`📥 Realtime receive: ${topicStr}`);
      }
    });
  }

  /**
   * Check if message is new
   * @param {Object} message - Message data
   * @returns {boolean}
   * @private
   */
  _isNewMessage(message) {
    try {
      const messageTime = new Date(parseInt(message.timestamp) / 1000);
      const isNew = messageTime > this.lastMessageCheck;
      
      if (isNew) {
        this.lastMessageCheck = messageTime;
      }
      
      return isNew;
    } catch (error) {
      logger.error('❌ Error checking message timestamp:', error.message);
      return true; // Default to processing
    }
  }

  /**
   * Handle incoming message
   * @param {Object} messageData - Raw message data
   * @param {Object} eventData - Event data
   * @returns {Promise<void>}
   * @private
   */
  async _handleMessage(messageData, eventData) {
    try {
      const threadId = eventData.thread?.thread_id || messageData.thread_id;
      if (!threadId) return;

      // Ensure chat exists
      let chat = this.cache.chats.get(threadId);
      if (!chat) {
        chat = await this.fetchChat(threadId);
      }

      // Create message object
      const message = this._createMessage(threadId, messageData);
      chat.messages.set(message.id, message);

      // Emit events
      this.emit('messageCreate', message);
      
      if (message.fromBot) {
        this.emit('messageSent', message);
      } else {
        this.emit('messageReceived', message);
      }

    } catch (error) {
      logger.error('❌ Error handling message:', error.message);
    }
  }


  /**
   * Attempt to reconnect
   * @private
   */
  async _attemptReconnect() {
    this._retryCount++;
    const delay = Math.min(1000 * Math.pow(2, this._retryCount), 30000);
    
    logger.info(`🔄 Attempting reconnect ${this._retryCount}/${this.options.maxRetries} in ${delay}ms...`);
    
    setTimeout(async () => {
      try {
        await this.ig.realtime.connect({
          autoReconnect: this.options.autoReconnect,
          irisData: await this.ig.feed.directInbox().request()
        });
        
        this._retryCount = 0;
        logger.info('✅ Reconnected successfully');
      } catch (error) {
        logger.error('❌ Reconnect failed:', error.message);
        
        if (this._retryCount >= this.options.maxRetries) {
          logger.error('❌ Max reconnect attempts reached');
          this.emit('maxRetriesReached');
        }
      }
    }, delay);
  }

  /**
   * Replay queued events
   * @private
   */
  _replayEvents() {
    for (const [eventType, data] of this._eventsToReplay) {
      if (eventType === 'message') {
        this._handleMessage(data.message, data);
      } else if (eventType === 'direct') {
        if (data.message) {
          this._handleMessage(data.message, data);
        }
      }
    }
    this._eventsToReplay = [];
  }

  /**
   * Load cookies from file
   * @returns {Promise<void>}
   * @private
   */
  async _loadCookies() {
    const cookiePath = this.options.sessionPath.replace('.json', '_cookies.json');
    
    if (!fs.existsSync(cookiePath)) {
      throw new Error('No cookies found');
    }

    const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
    
    for (const cookie of cookies) {
      const toughCookie = new tough.Cookie({
        key: cookie.name,
        value: cookie.value,
        domain: cookie.domain.replace(/^\./, ''),
        path: cookie.path || '/',
        secure: cookie.secure !== false,
        httpOnly: cookie.httpOnly !== false
      });

      await this.ig.state.cookieJar.setCookie(
        toughCookie.toString(),
        `https://${toughCookie.domain}${toughCookie.path}`
      );
    }

    logger.info(`🍪 Loaded ${cookies.length} cookies`);
  }

  /**
   * Save cookies to file
   * @returns {Promise<void>}
   * @private
   */
  async _saveCookies() {
    const cookiePath = this.options.sessionPath.replace('.json', '_cookies.json');
    const cookies = await this.ig.state.cookieJar.getCookies('https://instagram.com');
    
    const cookieData = cookies.map(cookie => ({
      name: cookie.key,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly
    }));

    // Ensure directory exists
    const dir = require('path').dirname(cookiePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(cookiePath, JSON.stringify(cookieData, null, 2));
    logger.info(`🍪 Saved ${cookieData.length} cookies`);
  }

  /**
   * Get client statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ready: this.ready,
      running: this.running,
      users: this.cache.users.size,
      chats: this.cache.chats.size,
      pendingChats: this.cache.pendingChats.size,
      messages: this.cache.messages.size,
      retryCount: this._retryCount,
      lastMessageCheck: this.lastMessageCheck
    };
  }

  /**
   * JSON representation
   * @returns {Object}
   */
  toJSON() {
    return {
      ready: this.ready,
      running: this.running,
      userId: this.user?.id,
      username: this.user?.username,
      stats: this.getStats()
    };
  }
}
