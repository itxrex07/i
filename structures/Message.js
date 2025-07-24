import { MessageCollector } from './MessageCollector.js';

/**
 * Represents an Instagram message with enhanced functionality
 */
export class Message {
constructor(client, chatId, data) {
  console.log('[DEBUG] Message data:', JSON.stringify(data, null, 2));
  if (!data.item_type) {
    console.warn('[WARN] message item_type is missing. Raw data:', JSON.stringify(data, null, 2));
  }

  this.client = client;
  this.id = data.item_id;
  this.chatId = chatId;
  this._data = data;
  this.type = this._determineType(data);
  this.timestamp = new Date(parseInt(data.timestamp) / 1000);
  this.authorId = data.user_id;
  this.content = this._extractContent(data);
  console.log('[DEBUG] Determined type:', this.type, 'Extracted content:', this.content);
  this.mediaData = this._extractMediaData(data);
  this.voiceData = this._extractVoiceData(data);
  this.storyData = this._extractStoryData(data);
  this.reactions = this._extractReactions(data);
  this.fromBot = this.authorId === this.client.user?.id;
  this.system = this.type === 'action_log';
  this._handleSentMessagePromise();
}

  /**
   * The chat this message belongs to
   * @type {Chat|null}
   */
  get chat() {
    return this.client.cache.chats.get(this.chatId);
  }

  /**
   * The author of this message
   * @type {User|null}
   */
  get author() {
    return this.client.cache.users.get(this.authorId);
  }

  /**
   * Whether the message has text content
   * @type {boolean}
   */
  get hasText() {
    return Boolean(this.content);
  }

  /**
   * Whether the message has media
   * @type {boolean}
   */
  get hasMedia() {
    return Boolean(this.mediaData);
  }

  /**
   * Whether the message is a voice message
   * @type {boolean}
   */
  get isVoice() {
    return this.type === 'voice_media';
  }

  /**
   * Whether the message is a like/heart
   * @type {boolean}
   */
  get isLike() {
    return this.type === 'like';
  }

  /**
   * Whether the message is a story share
   * @type {boolean}
   */
  get isStoryShare() {
    return this.type === 'story_share';
  }

  /**
   * Message age in milliseconds
   * @type {number}
   */
  get age() {
    return Date.now() - this.timestamp.getTime();
  }

  /**
   * Whether the message is recent (less than 10 seconds old)
   * @type {boolean}
   */
  get isRecent() {
    return this.age < 10000;
  }

/**
 * Determine message type from data
 * @param {Object} data - Raw message data
 * @returns {string}
 * @private
 */
_determineType(data) {
  if (!data.item_type) {
    console.warn('[WARN] Missing item_type. Inferring type from data:', JSON.stringify(data, null, 2));
    if (data.text || data.message || data.content) return 'text'; // Infer text type if text-like fields exist
    return 'unknown';
  }
  if (data.item_type === 'text') return 'text';
  if (data.item_type === 'link') return 'text'; // Treat links as text for content purposes
  if (data.item_type === 'story_share') return 'story_share';
  if (data.item_type === 'animated_media') return 'media';
  if (data.item_type === 'voice_media') return 'voice_media';
  if (data.item_type === 'media') return 'media';
  if (data.item_type === 'like') return 'like';
  console.warn('[WARN] Unknown item_type:', data.item_type, 'Raw data:', JSON.stringify(data, null, 2));
  return data.item_type || 'unknown';
}

/**
 * Extract text content from message data
 * @param {Object} data - Raw message data
 * @returns {string|null}
 * @private
 */
_extractContent(data) {
  if (data.text) return data.text;
  if (data.item_type === 'link' && data.link?.text) return data.link.text;
  if (data.item_type === 'story_share' && data.story_share?.text) return data.story_share.text;
  if (data.message) return data.message; // Check for 'message' field
  if (data.content) return data.content; // Check for 'content' field
  console.warn('[WARN] Unhandled message type for text extraction:', data.item_type, 'Raw data:', JSON.stringify(data, null, 2));
  return null;
}



  /**
   * Extract media data from message
   * @param {Object} data - Raw message data
   * @returns {Object|null}
   * @private
   */
  _extractMediaData(data) {
    if (data.item_type === 'animated_media') {
      return {
        type: 'animated',
        isSticker: data.animated_media.is_sticker,
        url: data.animated_media.images.fixed_height.url,
        width: data.animated_media.images.fixed_height.width,
        height: data.animated_media.images.fixed_height.height
      };
    }

    if (data.item_type === 'media') {
      const media = data.media;
      return {
        type: media.media_type === 1 ? 'photo' : 'video',
        url: media.image_versions2?.candidates[0]?.url || media.video_versions?.[0]?.url,
        width: media.original_width,
        height: media.original_height
      };
    }

    if (data.item_type === 'like') {
      return {
        type: 'like',
        url: null
      };
    }

    return null;
  }

  /**
   * Extract voice data from message
   * @param {Object} data - Raw message data
   * @returns {Object|null}
   * @private
   */
  _extractVoiceData(data) {
    if (data.item_type !== 'voice_media') return null;

    return {
      duration: data.voice_media.media.audio.duration,
      url: data.voice_media.media.audio.audio_src,
      waveform: data.voice_media.media.audio.waveform_data
    };
  }

  /**
   * Extract story data from message
   * @param {Object} data - Raw message data
   * @returns {Object|null}
   * @private
   */
  _extractStoryData(data) {
    if (data.item_type !== 'story_share') return null;

    const storyShare = data.story_share;
    if (!storyShare || !storyShare.media) return null;

    return {
      author: this.client._patchOrCreateUser(storyShare.media.user.pk, storyShare.media.user),
      url: storyShare.media.image_versions2?.candidates[0]?.url,
      isExpired: storyShare.message === 'No longer available'
    };
  }

  /**
   * Extract reactions from message
   * @param {Object} data - Raw message data
   * @returns {Array}
   * @private
   */
  _extractReactions(data) {
    if (!data.reactions?.likes) return [];

    return data.reactions.likes.map(reaction => ({
      userId: reaction.sender_id,
      timestamp: new Date(reaction.timestamp / 1000)
    }));
  }

  /**
   * Handle sent message promise resolution
   * @private
   */
  _handleSentMessagePromise() {
    if (this.chat?._sentMessagePromises.has(this.id)) {
      this.chat._resolveSentMessage(this.id, this);
    }
  }

  /**
   * Reply to this message
   * @param {string} content - Reply content
   * @returns {Promise<Message>}
   */
  async reply(content) {
    const prefix = this.client.options.disableReplyPrefix ? '' : `@${this.author?.username}, `;
    return await this.chat.sendMessage(`${prefix}${content}`);
  }

  /**
   * React to this message with a like
   * @returns {Promise<void>}
   */
  async like() {
    await this.chat.threadEntity.like(this.id);
  }

  /**
   * Remove like from this message
   * @returns {Promise<void>}
   */
  async unlike() {
    await this.chat.threadEntity.unlike(this.id);
  }

  /**
   * Mark this message as seen
   * @returns {Promise<void>}
   */
  async markSeen() {
    await this.chat.markMessageSeen(this.id);
  }

  /**
   * Delete this message
   * @returns {Promise<void>}
   */
  async delete() {
    await this.chat.deleteMessage(this.id);
  }

  /**
   * Create a message collector in this chat
   * @param {Object} options - Collector options
   * @returns {MessageCollector}
   */
  createMessageCollector(options) {
    return this.chat.createMessageCollector(options);
  }

  /**
   * Check if message mentions a user
   * @param {string|User} user - User to check
   * @returns {boolean}
   */
  mentions(user) {
    if (!this.content) return false;
    const username = typeof user === 'string' ? user : user.username;
    return this.content.includes(`@${username}`);
  }

  /**
   * Get all mentioned users in the message
   * @returns {string[]} Array of mentioned usernames
   */
  getMentions() {
    if (!this.content) return [];
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(this.content)) !== null) {
      mentions.push(match[1]);
    }
    
    return mentions;
  }

  /**
   * Check if message contains specific text
   * @param {string|RegExp} text - Text to search for
   * @returns {boolean}
   */
  includes(text) {
    if (!this.content) return false;
    
    if (text instanceof RegExp) {
      return text.test(this.content);
    }
    
    return this.content.toLowerCase().includes(text.toLowerCase());
  }

  /**
   * String representation
   * @returns {string}
   */
  toString() {
    return this.content || `[${this.type}]`;
  }

  /**
   * JSON representation
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      chatId: this.chatId,
      type: this.type,
      content: this.content,
      authorId: this.authorId,
      timestamp: this.timestamp,
      mediaData: this.mediaData,
      voiceData: this.voiceData,
      storyData: this.storyData,
      reactions: this.reactions,
      fromBot: this.fromBot,
      system: this.system
    };
  }
}
