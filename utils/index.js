import { InstagramBot } from './core/bot.js';
import { logger } from './utils/utils.js';
import { config } from './config.js';

console.clear();

class HyperInsta {
  constructor() {
    this.startTime = new Date();
    this.instagramBot = new InstagramBot();
  }

  async initialize() {
    try {
      this.showStartupBanner();
      
      console.log('📱 Connecting to Instagram...');
      await this.instagramBot.login();
      console.log('✅ Instagram connected');
      
      console.log('✅ Modules loaded');
      
      this.showLiveStatus();
      
    } catch (error) {
      console.log(`❌ Startup failed: ${error.message}`);
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
    console.clear();
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🚀 HYPER INSTA - LIVE & OPERATIONAL                     ║
║                                                              ║
║    ✅ Instagram: Connected & Active                         ║
║    ❌ Telegram: Disabled                                     ║
║    ⚡ Startup Time: ${Math.round(uptime)}ms                                  ║
║    🕒 Started: ${this.startTime.toLocaleTimeString()}                                ║
║                                                              ║
║    🎯 Ready for INSTANT commands...                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

🔥 Bot is running at MAXIMUM PERFORMANCE!
💡 Type .help in Instagram to see all commands
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
