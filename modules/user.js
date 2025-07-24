import { logger } from '../utils/utils.js';

/**
 * User management module for following, blocking, and user information
 */
export class UserModule {
  constructor() {
    this.name = 'user';
    this.description = 'User management - follow, unfollow, block, user info';
    this.commands = {};
    this.setupCommands();
  }

  setupCommands() {
    this.commands['follow'] = {
      handler: this.handleFollow.bind(this),
      description: 'Follow a user',
      usage: '.follow <username>',
      adminOnly: false
    };

    this.commands['unfollow'] = {
      handler: this.handleUnfollow.bind(this),
      description: 'Unfollow a user',
      usage: '.unfollow <username>',
      adminOnly: false
    };

    this.commands['block'] = {
      handler: this.handleBlock.bind(this),
      description: 'Block a user',
      usage: '.block <username>',
      adminOnly: true
    };

    this.commands['unblock'] = {
      handler: this.handleUnblock.bind(this),
      description: 'Unblock a user',
      usage: '.unblock <username>',
      adminOnly: true
    };

    this.commands['userinfo'] = {
      handler: this.handleUserInfo.bind(this),
      description: 'Get detailed information about a user',
      usage: '.userinfo <username>',
      adminOnly: false
    };

    this.commands['followers'] = {
      handler: this.handleFollowers.bind(this),
      description: 'Get followers list for a user',
      usage: '.followers <username> [limit]',
      adminOnly: false
    };

    this.commands['following'] = {
      handler: this.handleFollowing.bind(this),
      description: 'Get following list for a user',
      usage: '.following <username> [limit]',
      adminOnly: false
    };

    this.commands['friendship'] = {
      handler: this.handleFriendship.bind(this),
      description: 'Check friendship status with a user',
      usage: '.friendship <username>',
      adminOnly: false
    };
  }

  getCommands() {
    return this.commands;
  }

  async process(message) {
    return message;
  }

  async handleFollow(args, message) {
    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a username\nUsage: .follow <username>');
      return;
    }

    try {
      const username = args[0].replace('@', '');
      const user = await this.getClient().fetchUser(username);
      
      if (user.id === this.getClient().user.id) {
        await this.sendReply(message, '❌ Cannot follow yourself');
        return;
      }

      await user.follow();
      await this.sendReply(message, `✅ Successfully followed @${user.username}`);
      
      logger.info(`👥 Followed user: @${user.username}`);
      
    } catch (error) {
      logger.error('Follow error:', error.message);
      
      if (error.message.includes('already following')) {
        await this.sendReply(message, '❌ Already following this user');
      } else if (error.message.includes('private')) {
        await this.sendReply(message, '📨 Follow request sent to private account');
      } else {
        await this.sendReply(message, `❌ Failed to follow user: ${error.message}`);
      }
    }
  }

  async handleUnfollow(args, message) {
    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a username\nUsage: .unfollow <username>');
      return;
    }

    try {
      const username = args[0].replace('@', '');
      const user = await this.getClient().fetchUser(username);
      
      if (user.id === this.getClient().user.id) {
        await this.sendReply(message, '❌ Cannot unfollow yourself');
        return;
      }

      await user.unfollow();
      await this.sendReply(message, `✅ Successfully unfollowed @${user.username}`);
      
      logger.info(`👥 Unfollowed user: @${user.username}`);
      
    } catch (error) {
      logger.error('Unfollow error:', error.message);
      await this.sendReply(message, `❌ Failed to unfollow user: ${error.message}`);
    }
  }

  async handleBlock(args, message) {
    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a username\nUsage: .block <username>');
      return;
    }

    try {
      const username = args[0].replace('@', '');
      const user = await this.getClient().fetchUser(username);
      
      if (user.id === this.getClient().user.id) {
        await this.sendReply(message, '❌ Cannot block yourself');
        return;
      }

      await user.block();
      await this.sendReply(message, `🚫 Successfully blocked @${user.username}`);
      
      logger.info(`🚫 Blocked user: @${user.username}`);
      
    } catch (error) {
      logger.error('Block error:', error.message);
      await this.sendReply(message, `❌ Failed to block user: ${error.message}`);
    }
  }

  async handleUnblock(args, message) {
    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a username\nUsage: .unblock <username>');
      return;
    }

    try {
      const username = args[0].replace('@', '');
      const user = await this.getClient().fetchUser(username);
      
      await user.unblock();
      await this.sendReply(message, `✅ Successfully unblocked @${user.username}`);
      
      logger.info(`✅ Unblocked user: @${user.username}`);
      
    } catch (error) {
      logger.error('Unblock error:', error.message);
      await this.sendReply(message, `❌ Failed to unblock user: ${error.message}`);
    }
  }

  async handleUserInfo(args, message) {
    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a username\nUsage: .userinfo <username>');
      return;
    }

    try {
      const username = args[0].replace('@', '');
      const user = await this.getClient().fetchUser(username, true); // Force fresh data
      
      let info = `👤 **User Information**\n\n`;
      info += `🆔 Username: @${user.username}\n`;
      info += `📝 Full Name: ${user.fullName || 'Not set'}\n`;
      info += `🆔 User ID: ${user.id}\n\n`;
      
      info += `📊 **Statistics:**\n`;
      info += `📸 Posts: ${user.mediaCount?.toLocaleString() || 'Unknown'}\n`;
      info += `👥 Followers: ${user.followerCount?.toLocaleString() || 'Unknown'}\n`;
      info += `👤 Following: ${user.followingCount?.toLocaleString() || 'Unknown'}\n\n`;
      
      info += `🔒 **Account Status:**\n`;
      info += `🔐 Private: ${user.isPrivate ? 'Yes' : 'No'}\n`;
      info += `✅ Verified: ${user.isVerified ? 'Yes' : 'No'}\n`;
      info += `🏢 Business: ${user.isBusiness ? 'Yes' : 'No'}\n\n`;
      
      if (user.biography) {
        info += `📝 **Bio:**\n${user.biography}\n\n`;
      }
      
      if (user.lastSeen) {
        info += `👁️ Last Seen: ${user.lastSeen.toLocaleString()}\n`;
      }

      await this.sendReply(message, info);
      
    } catch (error) {
      logger.error('User info error:', error.message);
      
      if (error.message.includes('not found')) {
        await this.sendReply(message, '❌ User not found');
      } else {
        await this.sendReply(message, `❌ Failed to get user info: ${error.message}`);
      }
    }
  }

  async handleFollowers(args, message) {
    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a username\nUsage: .followers <username> [limit]');
      return;
    }

    try {
      const username = args[0].replace('@', '');
      const limit = parseInt(args[1]) || 10;
      const user = await this.getClient().fetchUser(username);
      
      if (user.isPrivate && user.id !== this.getClient().user.id) {
        await this.sendReply(message, '🔒 Cannot view followers of private account');
        return;
      }

      await message.chat.startTyping({ duration: 5000 });
      
      const followers = await user.fetchFollowers();
      const followersList = followers.array().slice(0, limit);
      
      let response = `👥 **Followers of @${user.username}** (${Math.min(limit, followers.size)}/${followers.size}):\n\n`;
      
      for (const follower of followersList) {
        response += `• @${follower.username}`;
        if (follower.fullName) {
          response += ` (${follower.fullName})`;
        }
        if (follower.isVerified) {
          response += ` ✅`;
        }
        response += `\n`;
      }

      await this.sendReply(message, response);
      
    } catch (error) {
      logger.error('Followers error:', error.message);
      await this.sendReply(message, `❌ Failed to get followers: ${error.message}`);
    } finally {
      await message.chat.stopTyping();
    }
  }

  async handleFollowing(args, message) {
    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a username\nUsage: .following <username> [limit]');
      return;
    }

    try {
      const username = args[0].replace('@', '');
      const limit = parseInt(args[1]) || 10;
      const user = await this.getClient().fetchUser(username);
      
      if (user.isPrivate && user.id !== this.getClient().user.id) {
        await this.sendReply(message, '🔒 Cannot view following of private account');
        return;
      }

      await message.chat.startTyping({ duration: 5000 });
      
      const following = await user.fetchFollowing();
      const followingList = following.array().slice(0, limit);
      
      let response = `👤 **Following by @${user.username}** (${Math.min(limit, following.size)}/${following.size}):\n\n`;
      
      for (const followedUser of followingList) {
        response += `• @${followedUser.username}`;
        if (followedUser.fullName) {
          response += ` (${followedUser.fullName})`;
        }
        if (followedUser.isVerified) {
          response += ` ✅`;
        }
        response += `\n`;
      }

      await this.sendReply(message, response);
      
    } catch (error) {
      logger.error('Following error:', error.message);
      await this.sendReply(message, `❌ Failed to get following: ${error.message}`);
    } finally {
      await message.chat.stopTyping();
    }
  }

  async handleFriendship(args, message) {
    if (!args[0]) {
      await this.sendReply(message, '❌ Please provide a username\nUsage: .friendship <username>');
      return;
    }

    try {
      const username = args[0].replace('@', '');
      const user = await this.getClient().fetchUser(username);
      
      const [isFollowing, isFollowedBy] = await Promise.all([
        this.getClient().user.isFollowing(user),
        this.getClient().user.isFollowedBy(user)
      ]);

      let status = `🤝 **Friendship Status with @${user.username}**\n\n`;
      status += `👤 You follow them: ${isFollowing ? '✅ Yes' : '❌ No'}\n`;
      status += `👥 They follow you: ${isFollowedBy ? '✅ Yes' : '❌ No'}\n\n`;
      
      if (isFollowing && isFollowedBy) {
        status += `💫 **Mutual Friends**`;
      } else if (isFollowing) {
        status += `➡️ **You follow them**`;
      } else if (isFollowedBy) {
        status += `⬅️ **They follow you**`;
      } else {
        status += `🚫 **No connection**`;
      }

      await this.sendReply(message, status);
      
    } catch (error) {
      logger.error('Friendship error:', error.message);
      await this.sendReply(message, `❌ Failed to check friendship: ${error.message}`);
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
}