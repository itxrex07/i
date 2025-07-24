import { logger } from '../utils/utils.js';
import { config } from '../config.js';

export class TelegramBridge {
  constructor(telegramBot, instagramBot) {
    this.telegramBot = telegramBot;
    this.instagramBot = instagramBot;
    this.enabled = false;
    this.chatMappings = new Map(); // Instagram chat ID -> Telegram topic ID
    this.topicMappings = new Map(); // Telegram topic ID -> Instagram chat ID
    this.bridgeGroupId = config.telegram.bridgeGroupId;
    this.messageQueue = [];
    this.processing = false;
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
      this.enabled = true;
      return true;
    } catch (error) {
      logger.error('❌ Failed to initialize bridge:', error.message);
      return false;
    }
  }

  setupEventHandlers() {
    // Handle Instagram messages
    if (this.instagramBot) {
      this.instagramBot.on('messageCreate', async (message) => {
        if (this.enabled && !message.fromBot) {
          await this.forwardToTelegram(message);
        }
      });
    }

    // Handle Telegram messages from bridge group
    if (this.telegramBot?.bot) {
      this.telegramBot.bot.on('message', async (msg) => {
        if (this.enabled && msg.chat.id === this.bridgeGroupId && msg.message_thread_id) {
          await this.forwardToInstagram(msg);
        }
      });
    }
  }

  async forwardToTelegram(instagramMessage) {
    try {
      const chatId = instagramMessage.chatId;
      let topicId = this.chatMappings.get(chatId);

      // Create topic if doesn't exist
      if (!topicId) {
        topicId = await this.createTopicForChat(instagramMessage.chat);
        if (!topicId) return;
      }

      // Format message for Telegram
      const formattedMessage = await this.formatInstagramMessage(instagramMessage);
      
      // Send to Telegram topic
      await this.sendToTelegramTopic(topicId, formattedMessage, instagramMessage);
      
      // Handle special message types
      await this.handleSpecialMessageTypes(topicId, instagramMessage);
      
      logger.debug(`📤 Forwarded Instagram message to Telegram topic ${topicId}`);
    } catch (error) {
      logger.error('❌ Failed to forward to Telegram:', error.message);
    }
  }

  async handleSpecialMessageTypes(topicId, message) {
    try {
      // Handle story shares
      if (message.isStoryShare && message.storyData) {
        const storyInfo = `
📖 **Story Share**
👤 From: @${message.storyData.author.username}
${message.storyData.isExpired ? '⏰ Story expired' : '✅ Story active'}
        `;
        
        await this.telegramBot.bot.sendMessage(
          this.bridgeGroupId,
          storyInfo,
          { message_thread_id: topicId, parse_mode: 'Markdown' }
        );
        
        if (message.storyData.url && !message.storyData.isExpired) {
          await this.telegramBot.bot.sendPhoto(
            this.bridgeGroupId,
            message.storyData.url,
            { message_thread_id: topicId, caption: '📖 Shared Story' }
          );
        }
      }

      // Handle reactions/likes
      if (message.reactions && message.reactions.length > 0) {
        const reactionInfo = `❤️ ${message.reactions.length} reaction(s)`;
        await this.telegramBot.bot.sendMessage(
          this.bridgeGroupId,
          reactionInfo,
          { message_thread_id: topicId }
        );
      }

      // Handle mentions
      const mentions = message.getMentions();
      if (mentions.length > 0) {
        const mentionInfo = `👥 Mentions: ${mentions.map(m => `@${m}`).join(', ')}`;
        await this.telegramBot.bot.sendMessage(
          this.bridgeGroupId,
          mentionInfo,
          { message_thread_id: topicId }
        );
      }

    } catch (error) {
      logger.error('❌ Failed to handle special message types:', error.message);
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

      const instagramChat = this.instagramBot.cache.chats.get(instagramChatId);
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

  async createTopicForChat(instagramChat) {
    try {
      // Generate topic name
      let topicName;
      if (instagramChat.isGroup) {
        topicName = instagramChat.name || `Group ${instagramChat.id.slice(-6)}`;
      } else {
        const recipient = instagramChat.recipient;
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
      const recipient = instagramChat.recipient;
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
    const sender = message.author;
    const senderName = sender ? (sender.fullName || sender.username) : 'Unknown';
    const senderUsername = sender ? sender.username : 'unknown';
    
    // Create header similar to WhatsApp bridge style
    let formatted = `📱 **Instagram** | 👤 **${senderName}** (@${senderUsername})\n`;
    formatted += `🕒 ${message.timestamp.toLocaleString()}\n`;
    formatted += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    // Format content based on message type
    switch (message.type) {
      case 'text':
      case 'link':
        formatted += `💬 ${message.content || 'Empty message'}`;
        break;
        
      case 'media':
        const mediaType = message.mediaData?.type || 'media';
        const mediaEmoji = mediaType === 'photo' ? '📸' : '🎥';
        formatted += `${mediaEmoji} **${mediaType.toUpperCase()}**`;
        if (message.content) {
          formatted += `\n📝 Caption: ${message.content}`;
        }
        if (message.mediaData?.duration) {
          formatted += `\n⏱️ Duration: ${Math.round(message.mediaData.duration)}s`;
        }
        break;
        
      case 'disappearing_media':
        formatted += `👻 **DISAPPEARING ${message.mediaData?.type?.toUpperCase() || 'MEDIA'}**`;
        if (message.mediaData?.viewMode) {
          formatted += ` (${message.mediaData.viewMode})`;
        }
        if (message.content) {
          formatted += `\n📝 Caption: ${message.content}`;
        }
        break;
        
      case 'voice_media':
        const duration = message.voiceData?.duration ? Math.round(message.voiceData.duration) : 0;
        formatted += `🎤 **Voice Message** (${duration}s)`;
        break;
        
      case 'animated_media':
        const animType = message.mediaData?.isSticker ? 'Sticker' : 'GIF';
        formatted += `🎭 **${animType}**`;
        if (message.mediaData?.duration) {
          formatted += ` (${Math.round(message.mediaData.duration)}s)`;
        }
        break;
        
      case 'story_share':
        formatted += `📖 **Story Share**`;
        if (message.storyData?.author) {
          formatted += ` from @${message.storyData.author.username}`;
        }
        if (message.storyData?.isExpired) {
          formatted += ` ⚠️ (Expired)`;
        }
        if (message.content) {
          formatted += `\n💬 ${message.content}`;
        }
        break;
        
      case 'reel_share':
        formatted += `🎬 **Reel Share**`;
        if (message.content) {
          formatted += `\n💬 ${message.content}`;
        }
        break;
        
      case 'media_share':
        formatted += `🔄 **Media Share**`;
        if (message.content) {
          formatted += `\n💬 ${message.content}`;
        }
        break;
        
      case 'felix_share':
        formatted += `📺 **IGTV Share**`;
        if (message.content) {
          formatted += `\n💬 ${message.content}`;
        }
        break;
        
      case 'clip':
        formatted += `🎞️ **Clip Share**`;
        if (message.content) {
          formatted += `\n💬 ${message.content}`;
        }
        break;
        
      case 'call':
        formatted += `📞 **${message.content}**`;
        break;
        
      case 'like':
        formatted += `❤️ **Liked a message**`;
        break;
        
      case 'location_share':
        formatted += `📍 **Location Share**\n${message.content}`;
        break;
        
      case 'profile_share':
        formatted += `👤 **Profile Share**\n${message.content}`;
        break;
        
      case 'action_log':
        formatted += `ℹ️ **${message.content}**`;
        break;
        
      case 'placeholder':
        formatted += `⚠️ **Message not available**\n${message.content}`;
        break;
        
      default:
        formatted += `📄 **${message.type.toUpperCase()}**`;
        if (message.content) {
          formatted += `\n💬 ${message.content}`;
        }
    }

    // Add reactions if any
    if (message.reactions && message.reactions.length > 0) {
      formatted += `\n\n❤️ ${message.reactions.length} reaction(s)`;
    }

    // Add mentions if any
    const mentions = message.getMentions();
    if (mentions.length > 0) {
      formatted += `\n👥 Mentions: ${mentions.map(m => `@${m}`).join(', ')}`;
    }

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
      if (originalMessage.hasMedia && originalMessage.mediaData) {
        await this.forwardMediaToTelegram(topicId, originalMessage);
      }

      // Handle voice messages
      if (originalMessage.isVoice && originalMessage.voiceData) {
        await this.forwardVoiceToTelegram(topicId, originalMessage);
      }

      // Send delivery confirmation emoji like WhatsApp bridge
      await this.telegramBot.bot.sendMessage(
        this.bridgeGroupId,
        '✅',
        {
          message_thread_id: topicId,
          reply_to_message_id: sentMessage.message_id
        }
      );
      return sentMessage;
    } catch (error) {
      logger.error('❌ Failed to send to Telegram topic:', error.message);
      // Send error emoji
      try {
        await this.telegramBot.bot.sendMessage(
          this.bridgeGroupId,
          '❌',
          { message_thread_id: topicId }
        );
      } catch (e) {
        logger.error('Failed to send error emoji:', e.message);
      }
    }
  }

  async forwardMediaToTelegram(topicId, message) {
    try {
      const mediaData = message.mediaData;
      
      if (mediaData.type === 'photo') {
        await this.telegramBot.bot.sendPhoto(
          this.bridgeGroupId,
          mediaData.url,
          {
            message_thread_id: topicId,
            caption: '📸 From Instagram'
          }
        );
      } else if (mediaData.type === 'video') {
        await this.telegramBot.bot.sendVideo(
          this.bridgeGroupId,
          mediaData.url,
          {
            message_thread_id: topicId,
            caption: '🎥 From Instagram'
          }
        );
      } else if (mediaData.type === 'animated') {
        await this.telegramBot.bot.sendAnimation(
          this.bridgeGroupId,
          mediaData.url,
          {
            message_thread_id: topicId,
            caption: '🎭 From Instagram'
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
      
      await this.telegramBot.bot.sendVoice(
        this.bridgeGroupId,
        voiceData.url,
        {
          message_thread_id: topicId,
          caption: '🎤 Voice message from Instagram',
          duration: voiceData.duration
        }
      );
    } catch (error) {
      logger.error('❌ Failed to forward voice:', error.message);
    }
  }

  async sendToInstagram(instagramChat, telegramMessage) {
    try {
      let deliveryStatus = '⏳'; // Pending
      let statusMessage;
      
      // Send status message first
      try {
        statusMessage = await this.telegramBot.bot.sendMessage(
          this.bridgeGroupId,
          deliveryStatus,
          {
            message_thread_id: telegramMessage.message_thread_id,
            reply_to_message_id: telegramMessage.message_id
          }
        );
      } catch (e) {
        logger.warn('Failed to send status message:', e.message);
      }

      // Handle different message types
      if (telegramMessage.text) {
        // Handle commands from Telegram
        if (telegramMessage.text.startsWith('.')) {
          await this.handleTelegramCommand(instagramChat, telegramMessage);
          deliveryStatus = '🔧'; // Command executed
        } else {
          await instagramChat.sendMessage(telegramMessage.text);
          deliveryStatus = '✅'; // Delivered
        }
      } else if (telegramMessage.photo) {
        const photo = telegramMessage.photo[telegramMessage.photo.length - 1];
        const file = await this.telegramBot.bot.getFile(photo.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
        
        // Download and send photo
        const response = await fetch(fileUrl);
        const buffer = await response.buffer();
        
        await instagramChat.sendPhoto(buffer, telegramMessage.caption);
        deliveryStatus = '✅📸'; // Photo delivered
      } else if (telegramMessage.video) {
        const file = await this.telegramBot.bot.getFile(telegramMessage.video.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
        
        const response = await fetch(fileUrl);
        const buffer = await response.buffer();
        
        await instagramChat.sendVideo(buffer, telegramMessage.caption);
        deliveryStatus = '✅🎥'; // Video delivered
      } else if (telegramMessage.voice) {
        const file = await this.telegramBot.bot.getFile(telegramMessage.voice.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
        
        const response = await fetch(fileUrl);
        const buffer = await response.buffer();
        
        await instagramChat.sendVoice(buffer);
        deliveryStatus = '✅🎤'; // Voice delivered
      } else if (telegramMessage.animation) {
        const file = await this.telegramBot.bot.getFile(telegramMessage.animation.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
        
        const response = await fetch(fileUrl);
        const buffer = await response.buffer();
        
        await instagramChat.sendPhoto(buffer, telegramMessage.caption); // Send as photo
        deliveryStatus = '✅🎭'; // Animation delivered
      } else if (telegramMessage.document) {
        await this.forwardDocumentToInstagram(instagramChat, telegramMessage);
          return;
        }
        
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
        // Handle document forwarding
        await this.forwardDocumentToInstagram(instagramChat, telegramMessage);
      } else if (telegramMessage.sticker) {
        // Handle sticker forwarding
        await this.forwardStickerToInstagram(instagramChat, telegramMessage);
      }
    } catch (error) {
      logger.error('❌ Failed to send to Instagram:', error.message);
    }
  }

  async handleTelegramCommand(instagramChat, telegramMessage) {
    try {
      const command = telegramMessage.text.slice(1);
      
      // Special bridge commands
      if (command === 'typing') {
        await instagramChat.startTyping({ duration: 5000 });
        await this.telegramBot.bot.sendMessage(
          this.bridgeGroupId,
          '⌨️ Started typing in Instagram chat',
          { message_thread_id: telegramMessage.message_thread_id }
        );
      } else if (command === 'chatinfo') {
        const info = `
📊 **Instagram Chat Info**
• ID: \`${instagramChat.id}\`
• Type: ${instagramChat.isGroup ? 'Group' : 'DM'}
• Users: ${instagramChat.users.size}
• Messages: ${instagramChat.messages.size}
        `;
        
        await this.telegramBot.bot.sendMessage(
          this.bridgeGroupId,
          info,
          { 
            message_thread_id: telegramMessage.message_thread_id,
            parse_mode: 'Markdown'
          }
        );
      } else {
        // Forward other commands to Instagram
        await instagramChat.sendMessage(telegramMessage.text);
      }
      
    } catch (error) {
      logger.error('❌ Failed to handle Telegram command:', error.message);
    }
  }

  async forwardDocumentToInstagram(instagramChat, telegramMessage) {
    try {
      const document = telegramMessage.document;
      const file = await this.telegramBot.bot.getFile(document.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
      
      // Check if it's an image document
      if (document.mime_type?.startsWith('image/')) {
        await instagramChat.sendPhoto(fileUrl);
      } else {
        // Send as text with file info
        await instagramChat.sendMessage(`📄 Document: ${document.file_name} (${document.file_size} bytes)`);
      }
      
    } catch (error) {
      logger.error('❌ Failed to forward document:', error.message);
    }
  }

  async forwardStickerToInstagram(instagramChat, telegramMessage) {
    try {
      const sticker = telegramMessage.sticker;
      const file = await this.telegramBot.bot.getFile(sticker.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
      
      // Convert sticker to image and send
      await instagramChat.sendPhoto(fileUrl);
      
    } catch (error) {
      logger.error('❌ Failed to forward sticker:', error.message);
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
