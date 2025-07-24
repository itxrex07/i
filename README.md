# Hyper Insta Bot

A powerful, modular Instagram bot built with Node.js that provides real-time message handling, rich media support, and extensible command system.

## 🚀 Features

### Core Features
- **Real-time Messaging**: Instant DM handling via Instagram MQTT
- **Modular Architecture**: Dynamic module loading and management
- **Rich Media Support**: Photos, voice messages, stickers, and more
- **Admin System**: Role-based command access control
- **Event System**: Comprehensive event handling for all Instagram interactions
- **Caching System**: Efficient user and chat caching
- **Auto-reconnection**: Robust connection handling with automatic reconnection

### Advanced Features
- **Message Collectors**: Advanced message collection patterns
- **Typing Indicators**: Realistic typing simulation
- **User Management**: Follow/unfollow, block/unblock operations
- **Chat Management**: Group chat operations, admin controls
- **Media Processing**: Automatic media type detection and processing
- **Spam Protection**: Built-in spam detection and filtering
- **Rate Limiting**: Intelligent rate limiting to avoid Instagram limits

## 📁 Project Structure

```
├── core/                   # Core bot functionality
│   ├── bot.js             # Main bot class
│   ├── client.js          # Enhanced Instagram client
│   ├── message-handler.js # Message processing
│   └── module-manager.js  # Module management
├── structures/            # Data structures
│   ├── User.js           # User object with methods
│   ├── Chat.js           # Chat object with methods
│   ├── Message.js        # Message object with methods
│   ├── Attachment.js     # Media attachment handling
│   └── Collection.js     # Enhanced collection class
├── modules/              # Bot modules
│   ├── core.js          # Core commands
│   ├── help.js          # Help system
│   ├── media.js         # Media handling
│   ├── user.js          # User management
│   └── chat.js          # Chat management
├── utils/               # Utilities
│   ├── utils.js        # General utilities
│   ├── cache.js        # Caching system
│   ├── rate-limiter.js # Rate limiting
│   └── media-processor.js # Media processing
├── docs/               # Documentation
│   ├── API.md         # API documentation
│   ├── MODULES.md     # Module development guide
│   └── EXAMPLES.md    # Usage examples
└── config.js          # Configuration
```

## 🛠️ Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd hyper-insta
```

2. Install dependencies:
```bash
npm install
```

3. Configure the bot:
```bash
cp config.example.js config.js
# Edit config.js with your settings
```

4. Set environment variables:
```bash
export INSTAGRAM_USERNAME="your_username"
export INSTAGRAM_PASSWORD="your_password"
```

5. Start the bot:
```bash
npm start
```

## 📖 Usage

### Basic Commands

- `.help` - Show all available commands
- `.ping` - Test bot responsiveness
- `.status` - Show bot status and statistics
- `.server` - Display server information

### Media Commands

- `.photo <url|file>` - Send a photo
- `.voice <file>` - Send a voice message
- `.sticker <query>` - Send a sticker

### User Management

- `.follow <username>` - Follow a user
- `.unfollow <username>` - Unfollow a user
- `.block <username>` - Block a user
- `.userinfo <username>` - Get user information

### Chat Management

- `.typing [duration]` - Start typing indicator
- `.collect <filter>` - Collect messages with filter
- `.chatinfo` - Get current chat information

## 🔧 Configuration

The bot uses a flexible configuration system. See `config.js` for all available options:

```javascript
export const config = {
  instagram: {
    username: 'your_username',
    password: 'your_password',
    sessionPath: './session/',
    messageCheckInterval: 5000,
    maxRetries: 3
  },
  
  modules: {
    autoLoad: true,
    modulesPath: './modules'
  },
  
  admin: {
    users: ['admin_username']
  },
  
  features: {
    mediaSupport: true,
    typingIndicators: true,
    messageCollectors: true,
    spamProtection: true
  }
};
```

## 📚 Module Development

Create custom modules by extending the base module class:

```javascript
export class MyModule {
  constructor() {
    this.name = 'mymodule';
    this.description = 'My custom module';
    this.commands = {};
    this.setupCommands();
  }

  setupCommands() {
    this.commands['mycommand'] = {
      handler: this.handleMyCommand.bind(this),
      description: 'My custom command',
      usage: '.mycommand [args]',
      adminOnly: false
    };
  }

  async handleMyCommand(args, message) {
    await message.reply('Hello from my module!');
  }

  getCommands() {
    return this.commands;
  }

  async process(message) {
    // Process all messages
    return message;
  }
}
```

## 🎯 Events

The bot emits various events you can listen to:

- `messageCreate` - New message received
- `messageDelete` - Message deleted
- `userFollow` - User followed the bot
- `userUnfollow` - User unfollowed the bot
- `chatUserAdd` - User added to chat
- `chatUserRemove` - User removed from chat
- `likeAdd` - Like added to message
- `likeRemove` - Like removed from message

## 🔒 Security

- Environment variable configuration
- Admin-only commands
- Rate limiting protection
- Input validation and sanitization
- Secure session management

## 📊 Monitoring

The bot includes comprehensive monitoring:

- Message statistics
- Command usage tracking
- Error logging
- Performance metrics
- Uptime monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- Check the documentation in `/docs`
- Review examples in `/docs/EXAMPLES.md`
- Open an issue for bugs or feature requests