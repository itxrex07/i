import { InstagramBot } from './core/instagram-bot.js';
import { TelegramBotManager } from './telegram/bot.js';
import { TelegramBridge } from './telegram/bridge.js';
import { logger } from './utils/utils.js';
import { config } from './config.js';

console.clear();

class HyperInsta {
  constructor() {
    this.startTime = new Date();
    this.instagramBot = new InstagramBot();
    this.telegramBot = null;
    this.telegramBridge = null;
  }

  async initialize() {
    try {
      this.showStartupBanner();

      console.log('📱 Connecting to Instagram...');

      const username = process.env.INSTAGRAM_USERNAME || config.instagram.username;
      const password = process.env.INSTAGRAM_PASSWORD || config.instagram.password;

      if (!username || !password) {
        throw new Error('Instagram credentials not provided');
      }

      // ✅ Login first
      await this.instagramBot.login(username, password);

      // Initialize Telegram bot if enabled
      if (config.telegram.enabled) {
        console.log('🤖 Initializing Telegram bot...');
        this.telegramBot = new TelegramBotManager(this.instagramBot);
        const telegramInitialized = await this.telegramBot.initialize();
        
        if (telegramInitialized) {
          // Initialize Telegram bridge
          this.telegramBridge = new TelegramBridge(this.telegramBot, this.instagramBot);
          await this.telegramBridge.initialize();
          
          // Set bridge in Instagram bot
          this.instagramBot.setTelegramBridge(this.telegramBridge);
          
          console.log('✅ Telegram integration initialized');
        }
      }

      // ✅ Then show status
      this.showLiveStatus();

    } catch (error) {
      console.error(`❌ Startup failed: ${error.stack || error.message}`);
      process.exit(1);
    }
  }

  showStartupBanner() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🚀 HYPER INSTA - INITIALIZING                           ║
║                                                              ║
║    ⚡ Ultra Fast • 🔌 Modular • 🛡️ Robust                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
  }

  showLiveStatus() {
    const uptime = Date.now() - this.startTime;
    const stats = this.instagramBot.getStats() || { modules: 0, commands: 0 };

    console.clear();
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🚀 HYPER INSTA - LIVE & OPERATIONAL                     ║
║                                                              ║
║    ✅ Instagram: Connected & Active                         ║
║    ${this.telegramBot ? '✅ Telegram: Connected & Active' : '❌ Telegram: Disabled'}                          ║
║    ${this.telegramBridge ? '✅ Bridge: Active' : '❌ Bridge: Disabled'}                                ║
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
${this.telegramBot ? '📱 Telegram bot is active for remote control' : ''}
    `);
  }

  async start() {
    await this.initialize();

    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down gracefully...');
      await this.instagramBot.disconnect();
      console.log('✅ Hyper Insta stopped');
      process.exit(0);
    });
  }
}

const bot = new HyperInsta();
bot.start().catch(console.error);
