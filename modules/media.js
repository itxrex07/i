import { Attachment } from '../structures/Attachment.js';
import { logger } from '../utils/utils.js';

/**
 * Media handling module for photos, videos, voice messages, and stickers
 */
export class MediaModule {
  constructor() {
    this.name = 'media';
    this.description = 'Handle media messages - photos, videos, voice, and stickers';
    this.commands = {};
    this.setupCommands();
  }

  setupCommands() {
    this.commands['photo'] = {
      handler: this.handlePhoto.bind(this),
      description: 'Send a photo from URL or file path',
      usage: '.photo <url|file_path>',
      adminOnly: false
    };

    this.commands['voice'] = {
      handler: this.handleVoice.bind(this),
      description: 'Send a voice message (MP4 audio file)',
      usage: '.voice <file_path>',
      adminOnly: false
    };

    this.commands['sticker'] = {
      handler: this.handleSticker.bind(this),
      description: 'Send a sticker or GIF',
      usage: '.sticker <url|file_path>',
      adminOnly: false
    };

    this.commands['download'] = {
      handler: this.handleDownload.bind(this),
      description: 'Download media from a message',
      usage: '.download [message_id]',
      adminOnly: false
    };

    this.commands['mediainfo'] = {
      handler: this.handleMediaInfo.bind(this),
      description: 'Get information about media in a message',
      usage: '.mediainfo [message_id]',
      adminOnly: false
    };
  }

  getCommands() {
    return this.commands;
  }

  async process(message) {
    // Log media messages for statistics
    if (message.hasMedia) {
      logger.info(`📸 Media message: ${message.mediaData.type} from @${message.author?.username}`);
    }
    
    return message;
  }

  async handlePhoto(args, message) {
    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a photo URL or file path\nUsage: .photo <url|file_path>');
      return;
    }

    try {
      await message.chat.startTyping({ duration: 5000 });
      
      const attachment = new Attachment(args[0]);
      await attachment._verify();

      if (attachment.type !== 'image') {
        await this.sendReply(message, '❌ The provided file is not a valid image');
        return;
      }

      const sentMessage = await message.chat.sendPhoto(attachment);
      logger.info(`📸 Photo sent: ${attachment.getFormattedSize()}`);
      
    } catch (error) {
      logger.error('Photo send error:', error.message);
      await this.sendReply(message, `❌ Failed to send photo: ${error.message}`);
    } finally {
      await message.chat.stopTyping();
    }
  }

  async handleVoice(args, message) {
    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a voice file path\nUsage: .voice <file_path>');
      return;
    }

    try {
      await message.chat.startTyping({ duration: 3000 });
      
      const fs = await import('fs');
      const filePath = args[0];
      
      if (!fs.existsSync(filePath)) {
        await this.sendReply(message, '❌ Voice file not found');
        return;
      }

      const buffer = fs.readFileSync(filePath);
      const sentMessage = await message.chat.sendVoice(buffer);
      
      logger.info(`🎤 Voice message sent: ${Math.round(buffer.length / 1024)}KB`);
      
    } catch (error) {
      logger.error('Voice send error:', error.message);
      await this.sendReply(message, `❌ Failed to send voice message: ${error.message}`);
    } finally {
      await message.chat.stopTyping();
    }
  }

  async handleSticker(args, message) {
    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a sticker URL or file path\nUsage: .sticker <url|file_path>');
      return;
    }

    try {
      await message.chat.startTyping({ duration: 3000 });
      
      const attachment = new Attachment(args[0]);
      await attachment._verify();

      // Send as photo (Instagram will handle sticker/GIF detection)
      const sentMessage = await message.chat.sendPhoto(attachment);
      logger.info(`🎭 Sticker sent: ${attachment.getFormattedSize()}`);
      
    } catch (error) {
      logger.error('Sticker send error:', error.message);
      await this.sendReply(message, `❌ Failed to send sticker: ${error.message}`);
    } finally {
      await message.chat.stopTyping();
    }
  }

  async handleDownload(args, message) {
    try {
      let targetMessage = message;
      
      // If message ID provided, find that message
      if (args[0]) {
        targetMessage = message.chat.messages.get(args[0]);
        if (!targetMessage) {
          await this.sendReply(message, '❌ Message not found');
          return;
        }
      }

      if (!targetMessage.hasMedia) {
        await this.sendReply(message, '❌ Message does not contain media');
        return;
      }

      const mediaData = targetMessage.mediaData;
      const mediaUrl = mediaData.url || targetMessage.voiceData?.url;
      
      if (!mediaUrl) {
        await this.sendReply(message, '❌ Media URL not available');
        return;
      }

      // Download the media
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(mediaUrl);
      const buffer = await response.buffer();
      
      // Save to downloads folder
      const fs = await import('fs');
      const path = await import('path');
      
      const downloadsDir = './downloads';
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
      }

      const extension = mediaData.type === 'photo' ? '.jpg' : 
                       mediaData.type === 'video' ? '.mp4' : 
                       targetMessage.isVoice ? '.mp4' : '.bin';
      
      const filename = `media_${targetMessage.id}${extension}`;
      const filepath = path.join(downloadsDir, filename);
      
      fs.writeFileSync(filepath, buffer);
      
      await this.sendReply(message, `✅ Media downloaded: ${filename}\nSize: ${Math.round(buffer.length / 1024)}KB`);
      logger.info(`💾 Media downloaded: ${filename}`);
      
    } catch (error) {
      logger.error('Download error:', error.message);
      await this.sendReply(message, `❌ Download failed: ${error.message}`);
    }
  }

  async handleMediaInfo(args, message) {
    try {
      let targetMessage = message;
      
      // If message ID provided, find that message
      if (args[0]) {
        targetMessage = message.chat.messages.get(args[0]);
        if (!targetMessage) {
          await this.sendReply(message, '❌ Message not found');
          return;
        }
      }

      if (!targetMessage.hasMedia && !targetMessage.isVoice) {
        await this.sendReply(message, '❌ Message does not contain media');
        return;
      }

      let info = `📊 **Media Information**\n\n`;
      info += `🆔 Message ID: ${targetMessage.id}\n`;
      info += `📅 Date: ${targetMessage.timestamp.toLocaleString()}\n`;
      info += `👤 Author: @${targetMessage.author?.username}\n\n`;

      if (targetMessage.hasMedia) {
        const media = targetMessage.mediaData;
        info += `🎭 Type: ${media.type}\n`;
        
        if (media.dimensions) {
          info += `📐 Dimensions: ${media.width}x${media.height}\n`;
        }
        
        if (media.url) {
          info += `🔗 URL: Available\n`;
        }
        
        if (media.isSticker) {
          info += `🎪 Sticker: Yes\n`;
        }
      }

      if (targetMessage.isVoice) {
        const voice = targetMessage.voiceData;
        info += `🎤 Voice Duration: ${voice.duration}ms\n`;
        info += `🔗 Audio URL: Available\n`;
      }

      await this.sendReply(message, info);
      
    } catch (error) {
      logger.error('Media info error:', error.message);
      await this.sendReply(message, `❌ Failed to get media info: ${error.message}`);
    }
  }

  async sendReply(message, text) {
    const coreModule = this.moduleManager.getModule('core');
    return await coreModule.instagramBot.sendMessage(message.threadId, text);
  }
}