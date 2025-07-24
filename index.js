import { InstagramBot } from './core/bot.js';
import { TelegramBotManager } from './telegram/bot.js';
import { TelegramBridge } from './telegram/bridge.js';
import { logger } from './utils/utils.js';
import { config } from './config.js';

class HyperInsta {
  constructor() {
    this.startTime = new Date();
    this.instagramBot = new InstagramBot();
    this.telegramBot = new TelegramBotManager();
    this.bridge = null;
  }

  async initialize() {
    try {
      this.showStartupBanner();
      
      // Initialize Telegram bot first (works independently)
      console.log('🤖 Initializing Telegram bot...');
      const telegramInitialized = await this.telegramBot.initialize();
      
      if (telegramInitialized) {
        console.log('✅ Telegram bot ready');
        this.telegramBot.instagramBot = this.instagramBot;
      }
      
      console.log('📱 Connecting to Instagram...');
      
      const username = process.env.INSTAGRAM_USERNAME || config.instagram.username;
      const password = process.env.INSTAGRAM_PASSWORD || config.instagram.password;
      
      if (!username || !password) {
        console.log('⚠️ Instagram credentials not provided, running in Telegram-only mode');
        if (telegramInitialized) {
          this.showTelegramOnlyStatus();
          return;
        } else {
          throw new Error('Neither Instagram nor Telegram could be initialized');
        }
      }
      
      await this.instagramBot.login(username, password);
      console.log('✅ Instagram connected');
      
      // Initialize bridge if both bots are ready
      if (telegramInitialized && config.telegram.bridgeGroupId) {
        console.log('🌉 Initializing Telegram bridge...');
        this.bridge = new TelegramBridge(this.telegramBot, this.instagramBot);
        const bridgeInitialized = await this.bridge.initialize();
        
        if (bridgeInitialized) {
          console.log('✅ Telegram bridge ready');
        }
      }
      
      this.showLiveStatus();
      
    } catch (error) {
      console.log(`❌ Instagram startup failed: ${error.message}`);
      
      // If Telegram is working, continue in Telegram-only mode
      if (this.telegramBot.isInitialized) {
        console.log('🤖 Continuing in Telegram-only mode...');
        this.showTelegramOnlyStatus();
      } else {
        console.log('❌ Complete startup failure');
        process.exit(1);
      }
    }
  }

  showLiveStatus() {
    const uptime = Date.now() - this.startTime;
    const stats = this.instagramBot.getStats();
    const telegramStatus = this.telegramBot.isInitialized ? 'Connected & Active' : 'Disconnected';
    const bridgeStatus = this.bridge?.enabled ? 'Active' : 'Inactive';
    
    console.clear();
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🚀 HYPER INSTA - LIVE & OPERATIONAL                     ║
║                                                              ║
║    ✅ Instagram: Connected & Active                         ║
║    🤖 Telegram: ${telegramStatus.padEnd(27)} ║
║    🌉 Bridge: ${bridgeStatus.padEnd(30)} ║
║    📦 Modules: ${stats.modules} loaded                                      ║
║    ⚡ Commands: ${stats.commands} available                              ║
║    ⚡ Startup Time: ${Math.round(uptime)}ms                                  ║
║    🕒 Started: ${this.startTime.toLocaleTimeString()}                                ║
║                                                              ║
║    🎯 Ready for INSTANT commands...                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

🔥 Bot is running at MAXIMUM PERFORMANCE!
💡 Type .help in Instagram to see all commands
💡 Use /start in Telegram for remote control
    `);
  }

  showTelegramOnlyStatus() {
    const uptime = Date.now() - this.startTime;
    
    console.clear();
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🤖 HYPER INSTA - TELEGRAM MODE                          ║
║                                                              ║
║    ❌ Instagram: Disconnected                               ║
║    ✅ Telegram: Connected & Active                          ║
║    ⚡ Startup Time: ${Math.round(uptime)}ms                                  ║
║    🕒 Started: ${this.startTime.toLocaleTimeString()}                                ║
║                                                              ║
║    🎯 Ready for Telegram commands...                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

🤖 Running in Telegram-only mode!
💡 Use /start in Telegram to authenticate and control the bot
💡 Upload cookies or enter credentials via Telegram to connect Instagram
    `);
  }

  async start() {
    await this.initialize();
    
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down gracefully...');
      
      if (this.instagramBot.ready) {
        await this.instagramBot.disconnect();
      }
      
      console.log('✅ Hyper Insta stopped');
      process.exit(0);
    });
  }
}
