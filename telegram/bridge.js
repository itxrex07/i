import { logger } from '../utils/utils.js';
import { config } from '../config.js';

export class TelegramBridge {
  constructor(telegramBot, instagramBot) {
    this.telegramBot = telegramBot;
    this.instagramBot = instagramBot;
    this.enabled = config.telegram.enabled || false;
    this.chatMappings = new Map(); // Instagram chat ID -> Telegram topic ID
    this.topicMappings = new Map(); // Telegram topic ID -> Instagram chat ID
    this.bridgeGroupId = config.telegram.bridgeGroupId;
    this.messageQueue = [];
    this.processing = false;
    this.autoApprove = config.telegram.autoApprovePending || false;
  }

  async initialize() {
    if (!this.bridgeGroupId) {
      logger.warn('⚠️ Bridge group ID not configured');
      return false;
    }

    try {
      // Verify bridge group exists and bot has admin rights
      const chat = await this.telegramBot.bot.getChat(this.bridgeGroupId);
      logger.info(`✅ Bridge initialized with group: ${chat.title}`);
      
      this.setupEventHandlers();
      return true;
    } catch (error) {
      logger.error('❌ Failed to initialize bridge:', error.message);
      return false;
    }
  }

  setupEventHandlers() {
    // Handle Telegram messages from bridge group
    if (this.telegramBot?.bot) {
      this.telegramBot.bot.on('message', async (msg) => {
        if (this.enabled && msg.chat.id == this.bridgeGroupId && msg.message_thread_id) {
          await this.forwardToInstagram(msg);
        }
      });
    }
  }

  async forwardToTelegram(message) {
    try {
      if (!this.enabled || !config.telegram.forwardMessages) return;
      if (message.fromBot) return; // Don't forward bot's own messages
      
      const chatId = message.chatID;
      let topicId = this.chatMappings.get(chatId);

      // Create topic if doesn't exist
      if (!topicId) {
        topicId = await this.createTopicForChat(message.chat);
        if (!topicId) return;
      }

      // Format message for Telegram
      const formattedMessage = await this.formatInstagramMessage(message);
      
      // Send to Telegram topic
      await this.sendToTelegramTopic(topicId, formattedMessage, message);
      
      logger.debug(`📤 Forwarded Instagram message to Telegram topic ${topicId}`);
    } catch (error) {
      logger.error('❌ Failed to forward to Telegram:', error.message);
    }
  }

  async forwardToInstagram(telegramMessage) {
    try {
      const topicId = telegramMessage.message_thread_id;
      const instagramChatId = this.topicMappings.get(topicId);

      if (!instagramChatId) {
        logger.warn(`⚠️ No Instagram chat mapped to topic ${topicId}`);
        return;
      }

      // Skip messages from the bot itself
      if (telegramMessage.from.is_bot) return;

      const instagramChat = this.instagramBot.client.cache.chats.get(instagramChatId);
      if (!instagramChat) {
        logger.warn(`⚠️ Instagram chat ${instagramChatId} not found`);
        return;
      }

      // Format and send message to Instagram
      await this.sendToInstagram(instagramChat, telegramMessage);
      
      logger.debug(`📤 Forwarded Telegram message to Instagram chat ${instagramChatId}`);
    } catch (error) {
      logger.error('❌ Failed to forward to Instagram:', error.message);
    }
  }

  async notifyPendingRequest(chat, action) {
    try {
      if (!this.enabled) return;
      
      const recipient = chat.users.first();
      const message = action === 'approved' 
        ? `✅ **Auto-approved pending request**\n\n👤 From: @${recipient?.username || 'Unknown'}\n🆔 Chat ID: \`${chat.id}\``
        : `📬 **New pending request**\n\n👤 From: @${recipient?.username || 'Unknown'}\n🆔 Chat ID: \`${chat.id}\`\n\n${this.autoApprove ? '⏳ Will auto-approve...' : '⚠️ Requires manual approval'}`;
      
      await this.telegramBot.bot.sendMessage(
        this.bridgeGroupId,
        message,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('❌ Failed to notify pending request:', error.message);
    }
  }

  async notifyNewFollower(user) {
    try {
      if (!this.enabled) return;
      
      const message = `👤 **New Follower**\n\n@${user.username}\n${user.fullName ? `📝 ${user.fullName}\n` : ''}🆔 ID: \`${user.id}\``;
      
      await this.telegramBot.bot.sendMessage(
        this.bridgeGroupId,
        message,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('❌ Failed to notify new follower:', error.message);
    }
  }

  async notifyFollowRequest(user) {
    try {
      if (!this.enabled) return;
      
      const message = `👤 **Follow Request**\n\n@${user.username}\n${user.fullName ? `📝 ${user.fullName}\n` : ''}🆔 ID: \`${user.id}\``;
      
      await this.telegramBot.bot.sendMessage(
        this.bridgeGroupId,
        message,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('❌ Failed to notify follow request:', error.message);
    }
  }

  async createTopicForChat(instagramChat) {
    try {
      // Generate topic name
      let topicName;
      if (instagramChat.isGroup) {
        topicName = instagramChat.name || `Group ${instagramChat.id.slice(-6)}`;
      } else {
        const recipient = instagramChat.users.find(u => u.id !== this.instagramBot.client.user.id);
        topicName = recipient ? `@${recipient.username}` : `DM ${instagramChat.id.slice(-6)}`;
      }

      // Create forum topic
      const topic = await this.telegramBot.bot.createForumTopic(
        this.bridgeGroupId,
        topicName,
        { icon_color: 0x6FB9F0 }
      );

      const topicId = topic.message_thread_id;

      // Store mappings
      this.chatMappings.set(instagramChat.id, topicId);
      this.topicMappings.set(topicId, instagramChat.id);

      // Send welcome message to topic
      const welcomeMessage = this.formatWelcomeMessage(instagramChat);
      await this.telegramBot.bot.sendMessage(
        this.bridgeGroupId,
        welcomeMessage,
        {
          message_thread_id: topicId,
          parse_mode: 'Markdown'
        }
      );

      logger.info(`✅ Created topic "${topicName}" for Instagram chat ${instagramChat.id}`);
      return topicId;
    } catch (error) {
      logger.error('❌ Failed to create topic:', error.message);
      return null;
    }
  }

  formatWelcomeMessage(instagramChat) {
    let message = `🌉 **Bridge Connected**\n\n`;
    
    if (instagramChat.isGroup) {
      message += `📱 **Instagram Group**: ${instagramChat.name || 'Unnamed Group'}\n`;
      message += `👥 **Members**: ${instagramChat.users.size}\n`;
    } else {
      const recipient = instagramChat.users.find(u => u.id !== this.instagramBot.client.user.id);
      message += `📱 **Instagram DM**: ${recipient ? `@${recipient.username}` : 'Unknown User'}\n`;
      if (recipient?.fullName) {
        message += `👤 **Name**: ${recipient.fullName}\n`;
      }
    }
    
    message += `🆔 **Chat ID**: \`${instagramChat.id}\`\n\n`;
    message += `💬 Messages will be forwarded bidirectionally between Instagram and this topic.`;
    
    return message;
  }

  async formatInstagramMessage(message) {
    let formatted = '';

    // Add sender info
    const sender = message.author;
    if (sender) {
      formatted += `👤 **${sender.fullName || sender.username}** (@${sender.username})\n`;
    }

    // Add message content based on type
    switch (message.type) {
      case 'text':
        formatted += message.content;
        break;
        
      case 'media':
        if (message.mediaData) {
          formatted += `📸 **MEDIA**`;
          if (message.content) {
            formatted += `\n${message.content}`;
          }
        }
        break;
        
      case 'voice_media':
        formatted += `🎤 **Voice Message**`;
        if (message.voiceData) {
          formatted += ` (${Math.round(message.voiceData.duration)}s)`;
        }
        break;
        
      case 'story_share':
        formatted += `📖 **Story Share**`;
        if (message.content) {
          formatted += `\n${message.content}`;
        }
        break;
        
      case 'like':
        formatted += `❤️ **Liked a message**`;
        break;
        
      default:
        formatted += `📄 **${message.type}**`;
        if (message.content) {
          formatted += `\n${message.content}`;
        }
    }

    // Add timestamp
    formatted += `\n\n🕒 ${message.timestamp.toLocaleString()}`;

    return formatted;
  }

  async sendToTelegramTopic(topicId, formattedMessage, originalMessage) {
    try {
      // Send text message
      const sentMessage = await this.telegramBot.bot.sendMessage(
        this.bridgeGroupId,
        formattedMessage,
        {
          message_thread_id: topicId,
          parse_mode: 'Markdown'
        }
      );

      // Handle media attachments
      if (originalMessage.mediaData && config.telegram.forwardMedia) {
        await this.forwardMediaToTelegram(topicId, originalMessage);
      }

      // Handle voice messages
      if (originalMessage.voiceData && config.telegram.forwardMedia) {
        await this.forwardVoiceToTelegram(topicId, originalMessage);
      }

      return sentMessage;
    } catch (error) {
      logger.error('❌ Failed to send to Telegram topic:', error.message);
    }
  }

  async forwardMediaToTelegram(topicId, message) {
    try {
      const mediaData = message.mediaData;
      
      if (mediaData.url) {
        await this.telegramBot.bot.sendPhoto(
          this.bridgeGroupId,
          mediaData.url,
          {
            message_thread_id: topicId,
            caption: '📸 From Instagram'
          }
        );
      }
    } catch (error) {
      logger.error('❌ Failed to forward media:', error.message);
    }
  }

  async forwardVoiceToTelegram(topicId, message) {
    try {
      const voiceData = message.voiceData;
      
      if (voiceData.sourceURL) {
        await this.telegramBot.bot.sendVoice(
          this.bridgeGroupId,
          voiceData.sourceURL,
          {
            message_thread_id: topicId,
            caption: '🎤 Voice message from Instagram',
            duration: voiceData.duration
          }
        );
      }
    } catch (error) {
      logger.error('❌ Failed to forward voice:', error.message);
    }
  }

  async sendToInstagram(instagramChat, telegramMessage) {
    try {
      // Handle different message types
      if (telegramMessage.text) {
        await instagramChat.sendMessage(telegramMessage.text);
      } else if (telegramMessage.photo) {
        const photo = telegramMessage.photo[telegramMessage.photo.length - 1];
        const file = await this.telegramBot.bot.getFile(photo.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
        
        await instagramChat.sendPhoto(fileUrl);
      } else if (telegramMessage.voice) {
        const file = await this.telegramBot.bot.getFile(telegramMessage.voice.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
        
        // Download and convert voice message
        const response = await fetch(fileUrl);
        const buffer = await response.buffer();
        
        await instagramChat.sendVoice(buffer);
      } else if (telegramMessage.document) {
        // Handle document forwarding if needed
        logger.info('📄 Document forwarding not implemented yet');
      }
    } catch (error) {
      logger.error('❌ Failed to send to Instagram:', error.message);
    }
  }

  async enable() {
    this.enabled = true;
    logger.info('✅ Telegram bridge enabled');
  }

  async disable() {
    this.enabled = false;
    logger.info('🔴 Telegram bridge disabled');
  }

  async getStats() {
    return {
      enabled: this.enabled,
      mappedChats: this.chatMappings.size,
      bridgeGroupId: this.bridgeGroupId,
      queuedMessages: this.messageQueue.length
    };
  }

  async clearMappings() {
    this.chatMappings.clear();
    this.topicMappings.clear();
    logger.info('🧹 Bridge mappings cleared');
  }

  async getMappings() {
    return {
      chatMappings: Object.fromEntries(this.chatMappings),
      topicMappings: Object.fromEntries(this.topicMappings)
    };
  }
}
