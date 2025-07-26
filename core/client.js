import { IgApiClient } from 'instagram-private-api';
import { withFbnsAndRealtime, withRealtime, withFbns } from 'instagram_mqtt';
import { EventEmitter } from 'events';
import fs from 'fs';
import tough from 'tough-cookie';
import { Collection } from '../structures/Collection.js';
import { User } from '../structures/User.js';
import { Chat } from '../structures/Chat.js';
import { Message } from '../structures/Message.js';
import { logger } from '../utils/utils.js';
import { Util } from '../utils/lib-util.js';

/**
 * Enhanced Instagram client with full feature support
 * @extends {EventEmitter}
 */
export class InstagramClient extends EventEmitter {
  constructor(options = {}) {
    super();

    /**
   * Load cookies from file
   * @returns {Promise<void>}
   * @private
   */
     * Client options
     * @type {Object}
     */
    this.options = {
      disableReplyPrefix: false,
      sessionPath: './session/session.json',
      messageCheckInterval: 5000,
      maxRetries: 3,
      autoReconnect: true,
      enableFbns: true,
      ...options
    };

    /**
     * Instagram API client
     * @type {IgApiClient}
     */
    this.ig = null;

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
  async login(username, password) {
    try {
      logger.info('🔑 Logging into Instagram...');
      
      // Always initialize with FBNS and Realtime support
      logger.info('🔧 Initializing with FBNS and Realtime support...');
      this.ig = withFbnsAndRealtime(new IgApiClient());
      
      this.ig.state.generateDevice(username);

      // Try to load full session state first (cookies + session data)
      let loginWithCookies = false;
      try {
        await this._loadSession();
        await this.ig.account.currentUser();
        logger.info('✅ Logged in using saved session');
        loginWithCookies = true;
      } catch (error) {
        logger.info('⚠️ Session login failed, trying cookies...');
        try {
          await this._loadCookies();
          await this.ig.account.currentUser();
          logger.info('✅ Logged in using saved cookies');
          loginWithCookies = true;
        } catch (cookieError) {
          if (!password) {
            throw new Error('❌ Password required for fresh login');
          }
          
          logger.info('🔑 Attempting fresh login...');
          await this.ig.account.login(username, password);
          await this._saveSession(); // Save full session after fresh login
          await this._saveCookies();
          logger.info('✅ Fresh login successful');
          loginWithCookies = false;
        }
      }

      // Get user info
      const userInfo = await this.ig.account.currentUser();
      this.user = this._patchOrCreateUser(userInfo.pk, userInfo);
      
      // Load existing chats
      await this._loadChats();

      // Setup realtime handlers
      this._setupRealtimeHandlers();

      // Connect to realtime first
      logger.info('🔌 Connecting to Instagram Realtime...');
      await this.ig.realtime.connect({
        autoReconnect: this.options.autoReconnect,
        irisData: await this.ig.feed.directInbox().request()
      });
      logger.info('✅ Realtime connected successfully');

      // Handle FBNS setup based on login method
      if (this.options.enableFbns) {
        if (loginWithCookies) {
          // For cookie/session login, we need to re-establish FBNS connection
          await this._setupFbnsAfterCookieLogin();
        } else {
          // For fresh login, FBNS should be ready
          this._setupFbnsHandlers();
          await this.ig.fbns.connect({
            autoReconnect: this.options.autoReconnect
          });
          
          // Clear any scheduled FBNS setup since we did fresh login
          this._clearFbnsSetupSchedule();
          
          logger.info('✅ FBNS connected with fresh login');
        }
      }

      this.ready = true;
      this.running = true;
      this._retryCount = 0;

      logger.info(`✅ Connected as @${this.user.username} (ID: ${this.user.id})`);
      logger.info(`📊 FBNS: ${this.options.enableFbns ? 'Enabled' : 'Disabled'}`);
      this.emit('ready');
      this.emit('connected'); // For backward compatibility

      // Replay queued events
      this._replayEvents();

    } catch (error) {
      logger.error('❌ Login failed:', error.message);
      throw error;
    }
  }

  /**
   * Logout from Instagram
   * @returns {Promise<void>}
   */
  async logout() {
    logger.info('🔌 Logging out from Instagram...');
    
    this.running = false;
    this.ready = false;

    try {
      if (this.ig.realtime) {
        await this.ig.realtime.disconnect();
      }
      if (this.options.enableFbns && this.ig.fbns) {
        await this.ig.fbns.disconnect();
      }
      if (this.ig.account) {
        await this.ig.account.logout();
      }
      logger.info('✅ Logged out successfully');
    } catch (error) {
      logger.warn('⚠️ Error during logout:', error.message);
    }

    this.emit('disconnect');
  }

  /**
   * Disconnect from Instagram (alias for logout)
   * @returns {Promise<void>}
   */
  async disconnect() {
    return this.logout();
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

    // Handle realtime receive events
    this.ig.realtime.on('receive', (topic, payload) => {
      this.handleRealtimeReceive(topic, payload);
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
  }

  /**
   * Setup FBNS after cookie login by re-establishing connection
   * @private
   */
  async _setupFbnsAfterCookieLogin() {
    logger.info('🔧 Setting up FBNS after cookie login...');
    
    try {
      // First, ensure we have the necessary tokens and session data
      if (!this.ig.fbns) {
        logger.warn('⚠️ FBNS not available in current client instance');
        this.options.enableFbns = false;
        return;
      }

      // Try to restore FBNS from saved session first
      const restored = await this._restoreFbnsFromSession();
      if (restored) {
        logger.info('✅ FBNS successfully restored from session');
        return;
      }

      // If restoration failed, try direct connection
      logger.info('📱 Attempting direct FBNS connection...');
      await this.ig.fbns.connect({
        autoReconnect: this.options.autoReconnect
      });

      // Setup handlers after successful connection
      this._setupFbnsHandlers();
      
      // Save the working session for future use
      await this._saveSession();
      
      logger.info('✅ FBNS successfully setup after cookie login');
      
    } catch (error) {
      logger.warn('⚠️ Failed to setup FBNS after cookie login:', error.message);
      
      // Check if it's a token/auth issue
      if (error.message.includes('400 Bad Request') || error.message.includes('Invalid request')) {
        logger.info('🔄 FBNS requires fresh authentication tokens...');
        
        try {
          await this._handleFbnsTokenRefresh();
        } catch (refreshError) {
          logger.warn('⚠️ FBNS token refresh failed:', refreshError.message);
          logger.warn('⚠️ Continuing without FBNS features...');
          this.options.enableFbns = false;
        }
      } else {
        logger.warn('⚠️ Continuing without FBNS features...');
        this.options.enableFbns = false;
      }
    }
  }

  /**
   * Handle FBNS token refresh when cookies-only login is insufficient
   * @private
   */
  async _handleFbnsTokenRefresh() {
    logger.info('🔄 Handling FBNS token refresh...');
    
    // Option 1: Try to use any cached password if available
    if (this.options.cachedPassword && this.user?.username) {
      try {
        logger.info('🔑 Attempting fresh login with cached credentials for FBNS...');
        
        // Backup current session
        const backupSession = await this.ig.state.serialize();
        
        // Fresh login to get FBNS tokens
        await this.ig.account.login(this.user.username, this.options.cachedPassword);
        
        // Connect FBNS with fresh tokens
        await this.ig.fbns.connect({
          autoReconnect: this.options.autoReconnect
        });
        
        this._setupFbnsHandlers();
        await this._saveSession();
        
        logger.info('✅ FBNS tokens refreshed successfully');
        return;
        
      } catch (error) {
        logger.error('❌ Failed to refresh FBNS with cached password:', error.message);
        // Restore backup session
        try {
          await this.ig.state.deserialize(backupSession);
        } catch (restoreError) {
          logger.error('❌ Failed to restore session backup:', restoreError.message);
        }
      }
    }
    
    // Option 2: Schedule FBNS setup for next full login
    logger.info('📝 Scheduling FBNS setup for next fresh login...');
    this._scheduleNextFbnsSetup();
    
    throw new Error('FBNS setup requires fresh authentication');
  }

  /**
   * Schedule FBNS setup for next fresh login
   * @private
   */
  _scheduleNextFbnsSetup() {
    const flagPath = this.options.sessionPath.replace('.json', '_fbns_needed.flag');
    fs.writeFileSync(flagPath, JSON.stringify({
      timestamp: Date.now(),
      reason: 'FBNS tokens expired, fresh login required'
    }));
    
    logger.info('🏃 Created flag for FBNS setup on next fresh login');
  }

  /**
   * Check if FBNS setup is scheduled
   * @returns {boolean}
   * @private
   */
  _isFbnsSetupScheduled() {
    const flagPath = this.options.sessionPath.replace('.json', '_fbns_needed.flag');
    return fs.existsSync(flagPath);
  }

  /**
   * Clear FBNS setup schedule
   * @private
   */
  _clearFbnsSetupSchedule() {
    const flagPath = this.options.sessionPath.replace('.json', '_fbns_needed.flag');
    if (fs.existsSync(flagPath)) {
      fs.unlinkSync(flagPath);
      logger.info('🗑️ Cleared FBNS setup schedule flag');
    }
  }

  /**
   * Refresh FBNS authentication by performing a fresh authentication flow
   * @private
   */
  async _refreshFbnsAuth() {
    logger.info('🔄 Refreshing FBNS authentication with fresh session...');
    
    try {
      // We need to re-authenticate to get fresh FBNS tokens
      // This is necessary because FBNS tokens aren't preserved in cookies
      
      logger.info('🔑 Performing fresh auth to obtain FBNS tokens...');
      
      // Save current state
      const currentCookies = await this.ig.state.cookieJar.getCookies('https://instagram.com');
      const currentUserId = this.user?.id;
      
      // Create a temporary client for fresh authentication
      const tempIg = withFbnsAndRealtime(new IgApiClient());
      tempIg.state.generateDevice(this.user.username);
      
      // We need the password for fresh login to get FBNS tokens
      // This is the limitation - FBNS requires fresh auth periodically
      logger.warn('⚠️ FBNS requires fresh authentication - password needed');
      logger.warn('⚠️ Saving current session state and disabling FBNS for now');
      
      // Save the current working session for future use
      await this._saveSession();
      
      throw new Error('FBNS requires fresh password authentication');
      
    } catch (error) {
      logger.error('❌ Failed to refresh FBNS authentication:', error.message);
      throw error;
    }
  }

  /**
   * Attempt to restore FBNS from saved session tokens
   * @private
   */
  async _restoreFbnsFromSession() {
    logger.info('🔄 Attempting to restore FBNS from session tokens...');
    
    try {
      const sessionPath = this.options.sessionPath;
      
      if (!fs.existsSync(sessionPath)) {
        throw new Error('No session file found for FBNS restoration');
      }
      
      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      
      // Check if we have FBNS-related tokens in the session
      if (sessionData.constants && sessionData.constants.FBNS_APPLICATION_ID) {
        logger.info('📱 Found FBNS tokens in session, attempting restoration...');
        
        // Apply the session state that includes FBNS tokens
        await this.ig.state.deserialize(sessionData);
        
        // Try to connect FBNS with restored tokens
        await this.ig.fbns.connect({
          autoReconnect: this.options.autoReconnect
        });
        
        this._setupFbnsHandlers();
        logger.info('✅ FBNS restored from session successfully');
        return true;
        
      } else {
        logger.warn('⚠️ No FBNS tokens found in session file');
        return false;
      }
      
    } catch (error) {
      logger.warn('⚠️ Failed to restore FBNS from session:', error.message);
      return false;
    }
  }
  /**
   * Setup FBNS event handlers
   * @private
   */
  _setupFbnsHandlers() {
    logger.info('📱 Setting up FBNS handlers...');

    try {
      if (this.ig.fbns && this.ig.fbns.push$) {
        this.ig.fbns.push$.subscribe({
          next: (data) => {
            this.handleFbnsReceive(data);
          },
          error: (error) => {
            logger.error('🚨 FBNS subscription error:', error.message);
            this.emit('error', error);
            
            // Try to reconnect FBNS on error
            if (this.options.autoReconnect) {
              setTimeout(() => this._attemptFbnsReconnect(), 5000);
            }
          },
          complete: () => {
            logger.info('📱 FBNS subscription completed');
          }
        });
        logger.info('✅ FBNS handlers setup successfully');
      } else {
        logger.warn('⚠️ FBNS push$ not available, retrying in 3 seconds...');
        setTimeout(() => {
          if (this.running && this.options.enableFbns) {
            this._setupFbnsHandlers();
          }
        }, 3000);
      }
    } catch (error) {
      logger.warn('⚠️ Failed to setup FBNS handlers:', error.message);
      // Retry once more after a delay
      setTimeout(() => {
        if (this.running && this.options.enableFbns) {
          this._setupFbnsHandlers();
        }
      }, 5000);
    }
  }

  /**
   * Attempt FBNS reconnection
   * @private
   */
  async _attemptFbnsReconnect() {
    if (!this.options.enableFbns || !this.running) return;
    
    logger.info('🔄 Attempting FBNS reconnection...');
    
    try {
      if (this.ig.fbns.isConnected) {
        await this.ig.fbns.disconnect();
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await this.ig.fbns.connect({
        autoReconnect: this.options.autoReconnect
      });
      
      this._setupFbnsHandlers();
      logger.info('✅ FBNS reconnected successfully');
      
    } catch (error) {
      logger.error('❌ FBNS reconnection failed:', error.message);
    }
  }

  /**
   * Handle Realtime messages with advanced processing
   * @param {object} topic
   * @param {object} payload
   * @private
   */
  handleRealtimeReceive(topic, payload) {
    if (!this.ready) {
      this._eventsToReplay.push(['realtime', topic, payload]);
      return;
    }

    this.emit('rawRealtime', topic, payload);

    if (topic.id === '146') {
      const rawMessages = JSON.parse(payload);
      rawMessages.forEach(async (rawMessage) => {
        rawMessage.data.forEach((data) => {
          this._processRealtimeData(data);
        });
      });
    }
  }

  /**
   * Process individual realtime data operations
   * @param {Object} data - Realtime data
   * @private
   */
  async _processRealtimeData(data) {
    switch (data.op) {
      case 'replace':
        await this._handleReplaceOperation(data);
        break;
      case 'add':
        await this._handleAddOperation(data);
        break;
      case 'remove':
        await this._handleRemoveOperation(data);
        break;
      default:
        break;
    }
  }

  /**
   * Handle replace operations (updates)
   * @param {Object} data - Operation data
   * @private
   */
  async _handleReplaceOperation(data) {
    // Handle inbox thread updates
    const isInboxThreadPath = Util.matchInboxThreadPath(data.path, false);
    if (isInboxThreadPath) {
      const [threadId] = Util.matchInboxThreadPath(data.path, true);
      await this._handleChatUpdate(threadId, JSON.parse(data.value));
      return;
    }

    // Handle message updates (likes, etc.)
    const isMessagePath = Util.matchMessagePath(data.path, false);
    if (isMessagePath) {
      const [threadId] = Util.matchMessagePath(data.path, true);
      await this._handleMessageUpdate(threadId, JSON.parse(data.value));
      return;
    }
  }

  /**
   * Handle add operations
   * @param {Object} data - Operation data
   * @private
   */
  async _handleAddOperation(data) {
    // Handle admin additions
    const isAdminPath = Util.matchAdminPath(data.path, false);
    if (isAdminPath) {
      const [threadId, userId] = Util.matchAdminPath(data.path, true);
      const chat = await this.fetchChat(threadId);
      chat.adminUserIDs.push(userId);
      const user = await this.fetchUser(userId);
      this.emit('chatAdminAdd', chat, user);
      return;
    }

    // Handle new messages
    const isMessagePath = Util.matchMessagePath(data.path, false);
    if (isMessagePath) {
      const [threadId] = Util.matchMessagePath(data.path, true);
      await this._handleNewMessage(threadId, JSON.parse(data.value));
      return;
    }
  }

  /**
   * Handle remove operations
   * @param {Object} data - Operation data
   * @private
   */
  async _handleRemoveOperation(data) {
    // Handle admin removals
    const isAdminPath = Util.matchAdminPath(data.path, false);
    if (isAdminPath) {
      const [threadId, userId] = Util.matchAdminPath(data.path, true);
      const chat = await this.fetchChat(threadId);
      chat.adminUserIDs = chat.adminUserIDs.filter(id => id !== userId);
      const user = await this.fetchUser(userId);
      this.emit('chatAdminRemove', chat, user);
      return;
    }

    // Handle message deletions
    const isMessagePath = Util.matchMessagePath(data.path, false);
    if (isMessagePath) {
      const [threadId] = Util.matchMessagePath(data.path, true);
      const chat = await this.fetchChat(threadId);
      const messageId = data.value;
      const existing = chat.messages.get(messageId);
      if (existing) {
        this.emit('messageDelete', existing);
      }
      return;
    }
  }

  /**
   * Handle chat updates
   * @param {string} threadId - Thread ID
   * @param {Object} newData - New chat data
   * @private
   */
  async _handleChatUpdate(threadId, newData) {
    if (this.cache.chats.has(threadId)) {
      const chat = this.cache.chats.get(threadId);
      const oldChat = Object.assign(Object.create(chat), chat);
      chat._patch(newData);

      // Compare name
      if (oldChat.name !== chat.name) {
        this.emit('chatNameUpdate', chat, oldChat.name, chat.name);
      }

      // Compare users
      if (oldChat.users.size < chat.users.size) {
        const userAdded = chat.users.find(u => !oldChat.users.has(u.id));
        if (userAdded) this.emit('chatUserAdd', chat, userAdded);
      } else if (oldChat.users.size > chat.users.size) {
        const userRemoved = oldChat.users.find(u => !chat.users.has(u.id));
        if (userRemoved) this.emit('chatUserRemove', chat, userRemoved);
      }

      // Compare calling status
      if (!oldChat.calling && chat.calling) {
        this.emit('callStart', chat);
      } else if (oldChat.calling && !chat.calling) {
        this.emit('callEnd', chat);
      }
    } else {
      const chat = new Chat(this, threadId, newData);
      this.cache.chats.set(chat.id, chat);
    }
  }

  /**
   * Handle message updates (likes, etc.)
   * @param {string} threadId - Thread ID
   * @param {Object} messageData - Message data
   * @private
   */  
  async _handleMessageUpdate(threadId, messageData) {
    const chat = await this.fetchChat(threadId);
    
    if (chat.messages.has(messageData.item_id)) {
      const message = chat.messages.get(messageData.item_id);
      const oldMessage = Object.assign(Object.create(message), message);
      message._patch(messageData);

      // Compare likes
      if (oldMessage.likes.length > message.likes.length) {
        const removed = oldMessage.likes.find(like => 
          !message.likes.some(l => l.userID === like.userID)
        );
        if (removed) {
          const user = await this.fetchUser(removed.userID);
          this.emit('likeRemove', user, message);
        }
      } else if (message.likes.length > oldMessage.likes.length) {
        const added = message.likes.find(like => 
          !oldMessage.likes.some(l => l.userID === like.userID)
        );
        if (added) {
          const user = await this.fetchUser(added.userID);
          this.emit('likeAdd', user, message);
        }
      }
    }
  }

  /**
   * Handle new messages
   * @param {string} threadId - Thread ID
   * @param {Object} messageData - Message data
   * @private
   */
  async _handleNewMessage(threadId, messageData) {
    // Skip invalid message types
    if (messageData.item_type === 'action_log' || messageData.item_type === 'video_call_event') {
      return;
    }

    const chat = await this.fetchChat(threadId);
    const message = this._createMessage(threadId, messageData);
    chat.messages.set(message.id, message);

    if (Util.isMessageValid(message)) {
      this.emit('messageCreate', message);
      
      if (message.fromBot) {
        this.emit('messageSent', message);
      } else {
        this.emit('messageReceived', message);
      }
    }
  }

  /**
   * Handle FBNS messages
   * @param {Object} data - FBNS data
   * @private
   */
  async handleFbnsReceive(data) {
    try {
      if (!this.ready) {
        this._eventsToReplay.push(['fbns', data]);
        return;
      }

      logger.debug('📱 FBNS received:', data.pushCategory);
      this.emit('rawFbns', data);

      switch (data.pushCategory) {
        case 'new_follower':
          if (data.sourceUserId) {
            const follower = await this.fetchUser(data.sourceUserId);
            this.emit('newFollower', follower);
            logger.info(`👤 New follower: @${follower.username}`);
          }
          break;

        case 'private_user_follow_request':
          if (data.sourceUserId) {
            const requester = await this.fetchUser(data.sourceUserId);
            this.emit('followRequest', requester);
            logger.info(`🔔 Follow request from: @${requester.username}`);
          }
          break;

        case 'direct_v2_pending':
          if (data.actionParams && data.actionParams.id) {
            if (!this.cache.pendingChats.get(data.actionParams.id)) {
              const pendingRequests = await this.ig.feed.directPending().items();
              pendingRequests.forEach(thread => {
                const chat = new Chat(this, thread.thread_id, thread);
                this.cache.chats.set(thread.thread_id, chat);
                this.cache.pendingChats.set(thread.thread_id, chat);
              });
            }
            const pendingChat = this.cache.pendingChats.get(data.actionParams.id);
            if (pendingChat) {
              this.emit('pendingRequest', pendingChat);
              logger.info(`💬 Pending message request from chat: ${pendingChat.id}`);
            }
          }
          break;

        case 'direct_v2_message':
          // Handle direct message notifications
          logger.debug('💬 Direct message notification received');
          break;

        case 'like':
          // Handle like notifications
          logger.debug('❤️ Like notification received');
          break;

        case 'comment':
          // Handle comment notifications
          logger.debug('💭 Comment notification received');
          break;

        default:
          logger.debug(`📱 Unknown FBNS category: ${data.pushCategory}`);
          this.emit('debug', 'Unknown FBNS category:', data.pushCategory, data);
          break;
      }
    } catch (error) {
      logger.error('❌ Error handling FBNS message:', error.message);
      this.emit('error', error);
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
    this._eventsToReplay.forEach(event => {
      const eventType = event.shift();
      if (eventType === 'realtime') {
        this.handleRealtimeReceive(...event);
      } else if (eventType === 'fbns') {
        this.handleFbnsReceive(...event);
      }
    });
    this._eventsToReplay = [];
  }

  /**
   * Load full session state from file
   * @returns {Promise<void>}
   * @private
   */
  async _loadSession() {
    const sessionPath = this.options.sessionPath;
    
    if (!fs.existsSync(sessionPath)) {
      throw new Error('No session found');
    }

    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    await this.ig.state.deserialize(session);
    
    logger.info(`📁 Loaded session state from ${sessionPath}`);
  }

  /**
   * Save full session state to file
   * @returns {Promise<void>}
   * @private
   */
  async _saveSession() {
    const sessionPath = this.options.sessionPath;
    const session = await this.ig.state.serialize();
    
    // Ensure directory exists
    const dir = require('path').dirname(sessionPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
    logger.info(`💾 Saved session state to ${sessionPath}`);
  }
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
      lastMessageCheck: this.lastMessageCheck,
      fbnsEnabled: this.options.enableFbns,
      fbnsConnected: this.options.enableFbns && this.ig?.fbns?.isConnected,
      realtimeConnected: this.ig?.realtime?.isConnected
    };
  }

  /**
   * Set cached password for FBNS token refresh (optional)
   * @param {string} password - Password to cache for FBNS refresh
   */
  setCachedPassword(password) {
    this.options.cachedPassword = password;
    logger.info('🔐 Cached password set for FBNS token refresh');
  }

  /**
   * Clear cached password
   */
  clearCachedPassword() {
    delete this.options.cachedPassword;
    logger.info('🗑️ Cleared cached password');
  }

  /**
   * Check if FBNS requires fresh authentication
   * @returns {boolean}
   */
  requiresFreshAuth() {
    return this._isFbnsSetupScheduled();
  }
   * @returns {Object}
   */
  getFbnsStatus() {
    return {
      enabled: this.options.enableFbns,
      available: !!(this.ig && this.ig.fbns),
      pushObservable: !!(this.ig && this.ig.fbns && this.ig.fbns.push$),
      connected: !!(this.ig && this.ig.fbns && this.ig.fbns.isConnected),
      ready: this.ready && this.options.enableFbns
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

/**
 * @event InstagramClient#messageCreate
 * @param {Message} message - The message that was sent
 */

/**
 * @event InstagramClient#messageDelete
 * @param {Message} message - The message that was deleted
 */

/**
 * @event InstagramClient#messageSent
 * @param {Message} message - The message that was sent by the bot
 */

/**
 * @event InstagramClient#messageReceived
 * @param {Message} message - The message that was received by the bot
 */

/**
 * @event InstagramClient#likeAdd
 * @param {User} user - The user who added the like
 * @param {Message} message - The message on which the like was added
 */

/**
 * @event InstagramClient#likeRemove
 * @param {User} user - The user who removed the like
 * @param {Message} message - The message on which the like was removed
 */

/**
 * @event InstagramClient#newFollower
 * @param {User} user - The user that started following the bot
 */

/**
 * @event InstagramClient#followRequest
 * @param {User} user - The user who wants to follow the bot
 */

/**
 * @event InstagramClient#pendingRequest
 * @param {Chat} chat - The chat that needs to be approved
 */

/**
 * @event InstagramClient#chatNameUpdate
 * @param {Chat} chat - The chat whose name has changed
 * @param {string} oldName - The previous name of the chat
 * @param {string} newName - The new name of the chat
 */

/**
 * @event InstagramClient#chatUserAdd
 * @param {Chat} chat - The chat in which the user has been added
 * @param {User} user - The user who has been added
 */

/**
 * @event InstagramClient#chatUserRemove
 * @param {Chat} chat - The chat from which the user has been removed
 * @param {User} user - The user who has been removed
 */

/**
 * @event InstagramClient#chatAdminAdd
 * @param {Chat} chat - The chat in which the user has become an administrator
 * @param {User} user - The user who has become admin
 */

/**
 * @event InstagramClient#chatAdminRemove
 * @param {Chat} chat - The chat in which the user has lost administrator privileges
 * @param {User} user - The user who has lost admin privileges
 */

/**
 * @event InstagramClient#callStart
 * @param {Chat} chat - The chat in which the call has started
 */

/**
 * @event InstagramClient#callEnd
 * @param {Chat} chat - The chat in which the call has ended
 */

/**
 * @event InstagramClient#ready
 * Emitted when the client is ready
 */

/**
 * @event InstagramClient#connected
 * Emitted when the client is connected (alias for ready)
 */

/**
 * @event InstagramClient#disconnect
 * Emitted when the client disconnects
 */

/**
 * @event InstagramClient#error
 * @param {Error} error - The error that occurred
 */

/**
 * @event InstagramClient#rawRealtime
 * @param {Object} topic - The realtime topic
 * @param {Object} payload - The realtime payload
 */

/**
 * @event InstagramClient#rawFbns
 * @param {Object} data - The FBNS data
 */

/**
 * @event InstagramClient#debug
 * @param {...any} args - Debug arguments
 */

/**
 * @event InstagramClient#maxRetriesReached
 * Emitted when maximum reconnection attempts are reached
 */
