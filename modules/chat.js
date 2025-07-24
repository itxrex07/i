import { logger } from '../utils/utils.js';

/**
 * Chat management module for group operations and message collection
 */
export class ChatModule {
  constructor() {
    this.name = 'chat';
    this.description = 'Chat management - typing, message collection, group operations';
    this.commands = {};
    this.activeCollectors = new Map();
    this.setupCommands();
  }

  setupCommands() {
    this.commands['typing'] = {
      handler: this.handleTyping.bind(this),
      description: 'Start typing indicator',
      usage: '.typing [duration_seconds]',
      adminOnly: false
    };

    this.commands['collect'] = {
      handler: this.handleCollect.bind(this),
      description: 'Collect messages with filters',
      usage: '.collect <max_messages> [time_seconds]',
      adminOnly: false
    };

    this.commands['stopcollect'] = {
      handler: this.handleStopCollect.bind(this),
      description: 'Stop active message collector',
      usage: '.stopcollect',
      adminOnly: false
    };

    this.commands['chatinfo'] = {
      handler: this.handleChatInfo.bind(this),
      description: 'Get information about current chat',
      usage: '.chatinfo',
      adminOnly: false
    };

    this.commands['adduser'] = {
      handler: this.handleAddUser.bind(this),
      description: 'Add user to group chat',
      usage: '.adduser <username>',
      adminOnly: true
    };

    this.commands['removeuser'] = {
      handler: this.handleRemoveUser.bind(this),
      description: 'Remove user from group chat',
      usage: '.removeuser <username>',
      adminOnly: true
    };

    this.commands['chatname'] = {
      handler: this.handleChatName.bind(this),
      description: 'Change group chat name',
      usage: '.chatname <new_name>',
      adminOnly: true
    };

    this.commands['leave'] = {
      handler: this.handleLeave.bind(this),
      description: 'Leave the current group chat',
      usage: '.leave',
      adminOnly: true
    };

    this.commands['mute'] = {
      handler: this.handleMute.bind(this),
      description: 'Mute the current chat',
      usage: '.mute',
      adminOnly: false
    };

    this.commands['pin'] = {
      handler: this.handlePin.bind(this),
      description: 'Pin the current chat',
      usage: '.pin',
      adminOnly: false
    };
  }

  getCommands() {
    return this.commands;
  }

  async process(message) {
    return message;
  }

  async handleTyping(args, message) {
    const duration = parseInt(args[0]) || 10;
    const maxDuration = 60; // Max 60 seconds
    
    const actualDuration = Math.min(duration, maxDuration);
    
    try {
      await message.chat.startTyping({ 
        duration: actualDuration * 1000,
        stopOnSend: false 
      });
      
      await this.sendReply(message, `⌨️ Typing for ${actualDuration} seconds...`);
      logger.info(`⌨️ Started typing in chat ${message.chatId} for ${actualDuration}s`);
      
    } catch (error) {
      logger.error('Typing error:', error.message);
      await this.sendReply(message, `❌ Failed to start typing: ${error.message}`);
    }
  }

  async handleCollect(args, message) {
    if (!args[0]) {
      await this.sendReply(message, '❌ Please specify max messages\nUsage: .collect <max_messages> [time_seconds]');
      return;
    }

    const maxMessages = parseInt(args[0]);
    const timeLimit = parseInt(args[1]) || 30;
    
    if (maxMessages < 1 || maxMessages > 100) {
      await this.sendReply(message, '❌ Max messages must be between 1 and 100');
      return;
    }

    if (this.activeCollectors.has(message.chatId)) {
      await this.sendReply(message, '❌ A collector is already active in this chat. Use .stopcollect first.');
      return;
    }

    try {
      const collector = message.chat.createMessageCollector({
        max: maxMessages,
        time: timeLimit * 1000,
        filter: (msg) => msg.id !== message.id // Don't collect the command message
      });

      this.activeCollectors.set(message.chatId, collector);

      let collectedCount = 0;
      
      collector.on('collect', (collectedMessage) => {
        collectedCount++;
        logger.info(`📥 Collected message ${collectedCount}/${maxMessages} from @${collectedMessage.author?.username}`);
      });

      collector.on('end', async (collected, reason) => {
        this.activeCollectors.delete(message.chatId);
        
        let response = `📊 **Collection Complete**\n\n`;
        response += `📝 Collected: ${collected.size} messages\n`;
        response += `⏰ Reason: ${reason}\n`;
        response += `⏱️ Duration: ${timeLimit}s\n\n`;
        
        if (collected.size > 0) {
          response += `**Messages:**\n`;
          const messages = collected.array().slice(0, 5); // Show first 5
          
          for (const msg of messages) {
            const author = msg.author?.username || 'Unknown';
            const content = msg.content ? 
              (msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content) :
              `[${msg.type}]`;
            response += `• @${author}: ${content}\n`;
          }
          
          if (collected.size > 5) {
            response += `... and ${collected.size - 5} more messages\n`;
          }
        }

        await this.sendReply(message, response);
        logger.info(`📊 Collection ended: ${collected.size} messages, reason: ${reason}`);
      });

      await this.sendReply(message, `🎯 Started collecting up to ${maxMessages} messages for ${timeLimit} seconds...`);
      
    } catch (error) {
      logger.error('Collect error:', error.message);
      await this.sendReply(message, `❌ Failed to start collector: ${error.message}`);
    }
  }

  async handleStopCollect(args, message) {
    const collector = this.activeCollectors.get(message.chatId);
    
    if (!collector) {
      await this.sendReply(message, '❌ No active collector in this chat');
      return;
    }

    collector.stop('manual');
    await this.sendReply(message, '⏹️ Message collector stopped');
  }

  async handleChatInfo(args, message) {
    try {
      const chat = message.chat;
      
      let info = `💬 **Chat Information**\n\n`;
      info += `🆔 Chat ID: ${chat.id}\n`;
      info += `📝 Name: ${chat.name || 'No custom name'}\n`;
      info += `👥 Type: ${chat.isGroup ? 'Group Chat' : 'Direct Message'}\n`;
      info += `👤 Users: ${chat.users.size}\n`;
      info += `📨 Messages: ${chat.messages.size}\n\n`;
      
      info += `⚙️ **Settings:**\n`;
      info += `🔇 Muted: ${chat.muted ? 'Yes' : 'No'}\n`;
      info += `📌 Pinned: ${chat.pinned ? 'Yes' : 'No'}\n`;
      info += `⏳ Pending: ${chat.pending ? 'Yes' : 'No'}\n`;
      info += `📞 Calling: ${chat.calling ? 'Yes' : 'No'}\n\n`;
      
      if (chat.lastActivityAt) {
        info += `⏰ Last Activity: ${chat.lastActivityAt.toLocaleString()}\n`;
      }

      if (chat.isGroup) {
        info += `\n👥 **Members:**\n`;
        const members = chat.users.array().slice(0, 10);
        for (const user of members) {
          info += `• @${user.username}`;
          if (chat.adminUserIds.includes(user.id)) {
            info += ` 👑`;
          }
          info += `\n`;
        }
        
        if (chat.users.size > 10) {
          info += `... and ${chat.users.size - 10} more members\n`;
        }
      }

      await this.sendReply(message, info);
      
    } catch (error) {
      logger.error('Chat info error:', error.message);
      await this.sendReply(message, `❌ Failed to get chat info: ${error.message}`);
    }
  }

  async handleAddUser(args, message) {
    if (!message.chat.isGroup) {
      await this.sendReply(message, '❌ This command only works in group chats');
      return;
    }

    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a username\nUsage: .adduser <username>');
      return;
    }

    try {
      const username = args[0].replace('@', '');
      const user = await this.getClient().fetchUser(username);
      
      await message.chat.addUser(user.id);
      await this.sendReply(message, `✅ Added @${user.username} to the group`);
      
      logger.info(`👥 Added user @${user.username} to group ${message.chatId}`);
      
    } catch (error) {
      logger.error('Add user error:', error.message);
      await this.sendReply(message, `❌ Failed to add user: ${error.message}`);
    }
  }

  async handleRemoveUser(args, message) {
    if (!message.chat.isGroup) {
      await this.sendReply(message, '❌ This command only works in group chats');
      return;
    }

    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a username\nUsage: .removeuser <username>');
      return;
    }

    try {
      const username = args[0].replace('@', '');
      const user = await this.getClient().fetchUser(username);
      
      if (user.id === this.getClient().user.id) {
        await this.sendReply(message, '❌ Cannot remove yourself. Use .leave instead.');
        return;
      }

      await message.chat.removeUser(user.id);
      await this.sendReply(message, `✅ Removed @${user.username} from the group`);
      
      logger.info(`👥 Removed user @${user.username} from group ${message.chatId}`);
      
    } catch (error) {
      logger.error('Remove user error:', error.message);
      await this.sendReply(message, `❌ Failed to remove user: ${error.message}`);
    }
  }

  async handleChatName(args, message) {
    if (!message.chat.isGroup) {
      await this.sendReply(message, '❌ This command only works in group chats');
      return;
    }

    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a new name\nUsage: .chatname <new_name>');
      return;
    }

    try {
      const newName = args.join(' ');
      const oldName = message.chat.name;
      
      await message.chat.setName(newName);
      await this.sendReply(message, `✅ Changed group name from "${oldName}" to "${newName}"`);
      
      logger.info(`📝 Changed group name: "${oldName}" → "${newName}"`);
      
    } catch (error) {
      logger.error('Chat name error:', error.message);
      await this.sendReply(message, `❌ Failed to change name: ${error.message}`);
    }
  }

  async handleLeave(args, message) {
    if (!message.chat.isGroup) {
      await this.sendReply(message, '❌ This command only works in group chats');
      return;
    }

    try {
      await this.sendReply(message, '👋 Leaving the group chat...');
      await message.chat.leave();
      
      logger.info(`👋 Left group chat ${message.chatId}`);
      
    } catch (error) {
      logger.error('Leave error:', error.message);
      await this.sendReply(message, `❌ Failed to leave chat: ${error.message}`);
    }
  }

  async handleMute(args, message) {
    try {
      // Note: Instagram API doesn't directly support muting, 
      // but we can track it locally
      message.chat.muted = !message.chat.muted;
      
      const status = message.chat.muted ? 'muted' : 'unmuted';
      await this.sendReply(message, `🔇 Chat ${status}`);
      
      logger.info(`🔇 Chat ${message.chatId} ${status}`);
      
    } catch (error) {
      logger.error('Mute error:', error.message);
      await this.sendReply(message, `❌ Failed to toggle mute: ${error.message}`);
    }
  }

  async handlePin(args, message) {
    try {
      // Note: Instagram API doesn't directly support pinning,
      // but we can track it locally
      message.chat.pinned = !message.chat.pinned;
      
      const status = message.chat.pinned ? 'pinned' : 'unpinned';
      await this.sendReply(message, `📌 Chat ${status}`);
      
      logger.info(`📌 Chat ${message.chatId} ${status}`);
      
    } catch (error) {
      logger.error('Pin error:', error.message);
      await this.sendReply(message, `❌ Failed to toggle pin: ${error.message}`);
    }
  }

  getClient() {
    return this.moduleManager.getModule('core').instagramBot.client || 
           this.moduleManager.getModule('core').instagramBot;
  }

  async sendReply(message, text) {
    const coreModule = this.moduleManager.getModule('core');
    return await coreModule.instagramBot.sendMessage(message.threadId, text);
  }

  async cleanup() {
    // Stop all active collectors
    for (const [chatId, collector] of this.activeCollectors) {
      collector.stop('cleanup');
    }
    this.activeCollectors.clear();
    logger.info('🧹 Cleaned up chat module collectors');
  }
}