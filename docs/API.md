# API Documentation

## Core Classes

### InstagramClient

The main client class that handles Instagram connection and provides high-level API access.

```javascript
import { InstagramClient } from './core/client.js';

const client = new InstagramClient({
  disableReplyPrefix: false,
  sessionPath: './session/session.json',
  autoReconnect: true
});

await client.login('username', 'password');
```

#### Events

- `ready` - Emitted when client is ready
- `messageCreate` - New message received
- `messageReceived` - Message received from others
- `messageSent` - Message sent by bot
- `disconnect` - Client disconnected
- `error` - Error occurred

#### Methods

- `login(username, password)` - Login to Instagram
- `disconnect()` - Disconnect from Instagram
- `fetchUser(query, force)` - Fetch user by ID or username
- `fetchChat(chatId, force)` - Fetch chat by ID
- `createChat(userIds)` - Create new chat
- `getStats()` - Get client statistics

### User

Represents an Instagram user with enhanced functionality.

```javascript
const user = await client.fetchUser('username');

console.log(user.username);
console.log(user.fullName);
console.log(user.isVerified);

await user.follow();
await user.send('Hello!');
```

#### Properties

- `id` - User ID
- `username` - Username
- `fullName` - Full name
- `isPrivate` - Whether account is private
- `isVerified` - Whether account is verified
- `isBusiness` - Whether account is business
- `avatarURL` - Profile picture URL
- `biography` - User biography
- `mediaCount` - Number of posts
- `followerCount` - Number of followers
- `followingCount` - Number of following

#### Methods

- `fetch(force)` - Refresh user data
- `follow()` - Follow user
- `unfollow()` - Unfollow user
- `block()` - Block user
- `unblock()` - Unblock user
- `send(content)` - Send message to user
- `sendPhoto(attachment)` - Send photo to user
- `fetchFollowers()` - Get followers list
- `fetchFollowing()` - Get following list

### Chat

Represents an Instagram chat/thread with enhanced functionality.

```javascript
const chat = await client.fetchChat('thread_id');

await chat.sendMessage('Hello!');
await chat.sendPhoto('./image.jpg');
await chat.startTyping({ duration: 5000 });
```

#### Properties

- `id` - Chat ID
- `name` - Chat name
- `isGroup` - Whether it's a group chat
- `users` - Collection of users in chat
- `messages` - Collection of messages
- `typing` - Whether bot is typing
- `muted` - Whether chat is muted
- `pinned` - Whether chat is pinned

#### Methods

- `sendMessage(content)` - Send text message
- `sendPhoto(attachment)` - Send photo
- `sendVoice(buffer)` - Send voice message
- `startTyping(options)` - Start typing indicator
- `stopTyping()` - Stop typing indicator
- `markMessageSeen(messageId)` - Mark message as seen
- `deleteMessage(messageId)` - Delete message
- `createMessageCollector(options)` - Create message collector
- `addUser(user)` - Add user to group
- `removeUser(user)` - Remove user from group
- `setName(name)` - Change chat name
- `leave()` - Leave chat

### Message

Represents an Instagram message with enhanced functionality.

```javascript
client.on('messageCreate', (message) => {
  console.log(`${message.author.username}: ${message.content}`);
  
  if (message.hasMedia) {
    console.log('Media type:', message.mediaData.type);
  }
  
  if (message.content === 'ping') {
    message.reply('pong!');
  }
});
```

#### Properties

- `id` - Message ID
- `content` - Message text content
- `author` - User who sent message
- `chat` - Chat where message was sent
- `timestamp` - When message was sent
- `type` - Message type (text, media, voice, etc.)
- `hasText` - Whether message has text
- `hasMedia` - Whether message has media
- `isVoice` - Whether message is voice
- `mediaData` - Media information
- `voiceData` - Voice message information
- `reactions` - Message reactions/likes

#### Methods

- `reply(content)` - Reply to message
- `like()` - Like message
- `unlike()` - Remove like
- `markSeen()` - Mark as seen
- `delete()` - Delete message
- `mentions(user)` - Check if message mentions user
- `includes(text)` - Check if message contains text

### MessageCollector

Collects messages based on filters and conditions.

```javascript
const collector = chat.createMessageCollector({
  max: 10,
  time: 30000,
  filter: (msg) => msg.content.includes('hello')
});

collector.on('collect', (message) => {
  console.log('Collected:', message.content);
});

collector.on('end', (collected, reason) => {
  console.log(`Collected ${collected.size} messages. Reason: ${reason}`);
});
```

#### Options

- `max` - Maximum messages to collect
- `time` - Time limit in milliseconds
- `idle` - Idle timeout in milliseconds
- `filter` - Filter function for messages

#### Events

- `collect` - Message collected
- `end` - Collection ended
- `error` - Error occurred

### Attachment

Handles media attachments for messages.

```javascript
import { Attachment } from './structures/Attachment.js';

// From URL
const attachment = new Attachment('https://example.com/image.jpg');
await attachment._verify();
await chat.sendPhoto(attachment);

// From file
const attachment2 = new Attachment('./local-image.jpg');
await attachment2._verify();
await chat.sendPhoto(attachment2);
```

#### Methods

- `_verify()` - Process and verify attachment
- `save(filePath)` - Save attachment to file
- `getInfo()` - Get attachment information
- `getFormattedSize()` - Get human-readable file size

## Module System

### Creating Modules

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

  async cleanup() {
    // Cleanup when module is unloaded
  }
}
```

### Module Manager

```javascript
const moduleManager = new ModuleManager(bot);
await moduleManager.loadModules();

const command = moduleManager.getCommand('help');
const module = moduleManager.getModule('core');
```

## Utilities

### Collection

Enhanced Map with additional methods.

```javascript
import { Collection } from './structures/Collection.js';

const collection = new Collection();
collection.set('key', 'value');

const first = collection.first();
const filtered = collection.filter(item => item.includes('test'));
const mapped = collection.map(item => item.toUpperCase());
```

### Logger

```javascript
import { logger } from './utils/utils.js';

logger.info('Information message');
logger.error('Error message');
logger.warn('Warning message');
logger.debug('Debug message'); // Only shown if LOG_LEVEL=debug
```

## Configuration

```javascript
export const config = {
  instagram: {
    username: 'your_username',
    password: 'your_password',
    sessionPath: './session/',
    messageCheckInterval: 5000,
    maxRetries: 3,
    autoReconnect: true
  },
  
  admin: {
    users: ['admin_username']
  },
  
  features: {
    mediaSupport: true,
    typingIndicators: true,
    messageCollectors: true
  }
};
```