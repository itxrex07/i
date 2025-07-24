# Usage Examples

## Basic Bot Setup

```javascript
import { InstagramBot } from './core/bot.js';

const bot = new InstagramBot();

// Login
await bot.login('your_username', 'your_password');

// Bot is now running and will handle messages automatically
console.log('Bot is ready!');
```

## Working with Users

### Fetch User Information

```javascript
// Get user by username
const user = await bot.client.fetchUser('instagram');

console.log(`User: @${user.username}`);
console.log(`Full Name: ${user.fullName}`);
console.log(`Followers: ${user.followerCount?.toLocaleString()}`);
console.log(`Verified: ${user.isVerified ? 'Yes' : 'No'}`);
console.log(`Private: ${user.isPrivate ? 'Yes' : 'No'}`);
```

### User Operations

```javascript
const user = await bot.client.fetchUser('target_username');

// Follow user
await user.follow();
console.log(`Followed @${user.username}`);

// Send message
await user.send('Hello! 👋');

// Send photo
await user.sendPhoto('https://example.com/image.jpg');

// Get followers (if public account)
const followers = await user.fetchFollowers();
console.log(`${user.username} has ${followers.size} followers`);

// Check if user follows you
const followsYou = await user.isFollowedBy(bot.client.user);
console.log(`Follows you: ${followsYou}`);
```

## Working with Chats

### Send Messages

```javascript
// Get chat by ID
const chat = await bot.client.fetchChat('thread_id');

// Send text message
await chat.sendMessage('Hello everyone! 🎉');

// Send photo from URL
await chat.sendPhoto('https://picsum.photos/800/600');

// Send photo from file
await chat.sendPhoto('./images/photo.jpg');

// Send voice message
const fs = await import('fs');
const voiceBuffer = fs.readFileSync('./audio/voice.mp4');
await chat.sendVoice(voiceBuffer);
```

### Typing Indicators

```javascript
// Start typing for 10 seconds
await chat.startTyping({ duration: 10000 });

// Start typing and stop manually
await chat.startTyping();
// ... do some work
await chat.stopTyping();

// Type while processing
await chat.startTyping({ duration: 30000 });
const result = await someExpensiveOperation();
await chat.sendMessage(`Result: ${result}`);
// Typing stops automatically when message is sent
```

### Group Chat Management

```javascript
// Add user to group
const newUser = await bot.client.fetchUser('new_member');
await chat.addUser(newUser);

// Remove user from group
await chat.removeUser(newUser);

// Change group name
await chat.setName('New Group Name');

// Leave group
await chat.leave();

// Get chat info
console.log(`Chat: ${chat.name || 'Unnamed'}`);
console.log(`Members: ${chat.users.size}`);
console.log(`Is Group: ${chat.isGroup}`);
console.log(`Messages: ${chat.messages.size}`);
```

## Message Handling

### Basic Message Processing

```javascript
bot.client.on('messageCreate', async (message) => {
  console.log(`${message.author.username}: ${message.content}`);
  
  // Ignore messages from bot itself
  if (message.fromBot) return;
  
  // Handle different message types
  if (message.hasText) {
    console.log('Text message:', message.content);
  }
  
  if (message.hasMedia) {
    console.log('Media type:', message.mediaData.type);
    console.log('Media URL:', message.mediaData.url);
  }
  
  if (message.isVoice) {
    console.log('Voice duration:', message.voiceData.duration);
  }
});
```

### Auto-Reply System

```javascript
bot.client.on('messageCreate', async (message) => {
  if (message.fromBot) return;
  
  const content = message.content?.toLowerCase();
  
  // Greeting responses
  if (content?.includes('hello') || content?.includes('hi')) {
    await message.reply('Hello! 👋 How can I help you?');
  }
  
  // FAQ responses
  else if (content?.includes('help')) {
    await message.reply('Type .help to see all available commands!');
  }
  
  // React to mentions
  else if (message.mentions(bot.client.user)) {
    await message.reply('You mentioned me! 😊');
    await message.like(); // Like the message
  }
});
```

### Message Collectors

```javascript
// Collect messages for 30 seconds
const collector = chat.createMessageCollector({
  max: 10,           // Maximum 10 messages
  time: 30000,       // 30 seconds
  filter: (msg) => !msg.fromBot && msg.hasText
});

collector.on('collect', (message) => {
  console.log(`Collected: ${message.content}`);
});

collector.on('end', (collected, reason) => {
  console.log(`Collected ${collected.size} messages. Reason: ${reason}`);
  
  // Process collected messages
  const messages = collected.array();
  const wordCount = messages.reduce((count, msg) => {
    return count + (msg.content?.split(' ').length || 0);
  }, 0);
  
  chat.sendMessage(`📊 Collected ${messages.length} messages with ${wordCount} total words!`);
});

// Start collection
await chat.sendMessage('🎯 Starting message collection for 30 seconds...');
```

### Advanced Message Filtering

```javascript
// Collect only messages with specific criteria
const collector = chat.createMessageCollector({
  filter: (message) => {
    // Only from specific users
    const allowedUsers = ['user1', 'user2'];
    if (!allowedUsers.includes(message.author.username)) return false;
    
    // Only text messages
    if (!message.hasText) return false;
    
    // Only messages with certain keywords
    const keywords = ['important', 'urgent', 'help'];
    return keywords.some(keyword => 
      message.content.toLowerCase().includes(keyword)
    );
  },
  max: 5,
  time: 60000
});

collector.on('collect', async (message) => {
  await message.reply('✅ Important message collected!');
  await message.like();
});
```

## Media Handling

### Working with Attachments

```javascript
import { Attachment } from './structures/Attachment.js';

// From URL
const urlAttachment = new Attachment('https://picsum.photos/800/600');
await urlAttachment._verify();
console.log('Type:', urlAttachment.type);
console.log('Size:', urlAttachment.getFormattedSize());
await chat.sendPhoto(urlAttachment);

// From file
const fileAttachment = new Attachment('./images/photo.jpg');
await fileAttachment._verify();
await chat.sendPhoto(fileAttachment);

// From buffer
const fs = await import('fs');
const buffer = fs.readFileSync('./images/photo.jpg');
const bufferAttachment = new Attachment(buffer);
await bufferAttachment._verify();
await chat.sendPhoto(bufferAttachment);
```

### Media Processing

```javascript
bot.client.on('messageCreate', async (message) => {
  if (!message.hasMedia) return;
  
  const media = message.mediaData;
  
  // Handle different media types
  switch (media.type) {
    case 'photo':
      console.log(`Photo: ${media.width}x${media.height}`);
      await message.reply('Nice photo! 📸');
      break;
      
    case 'video':
      console.log('Video received');
      await message.reply('Cool video! 🎥');
      break;
      
    case 'animated':
      if (media.isSticker) {
        await message.reply('Love the sticker! 😄');
      } else {
        await message.reply('Great GIF! 🎭');
      }
      break;
  }
  
  // Download media
  if (media.url) {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(media.url);
      const buffer = await response.buffer();
      
      // Save to file
      const fs = await import('fs');
      const filename = `media_${message.id}.jpg`;
      fs.writeFileSync(`./downloads/${filename}`, buffer);
      
      console.log(`Saved media: ${filename}`);
    } catch (error) {
      console.error('Failed to download media:', error);
    }
  }
});
```

## Custom Commands

### Simple Command Module

```javascript
export class CustomCommandsModule {
  constructor() {
    this.name = 'custom';
    this.description = 'Custom commands example';
    this.commands = {};
    this.setupCommands();
  }

  setupCommands() {
    this.commands['joke'] = {
      handler: this.handleJoke.bind(this),
      description: 'Tell a random joke',
      usage: '.joke',
      adminOnly: false
    };

    this.commands['weather'] = {
      handler: this.handleWeather.bind(this),
      description: 'Get weather for a city',
      usage: '.weather <city>',
      adminOnly: false
    };

    this.commands['remind'] = {
      handler: this.handleRemind.bind(this),
      description: 'Set a reminder',
      usage: '.remind <minutes> <message>',
      adminOnly: false
    };
  }

  async handleJoke(args, message) {
    const jokes = [
      "Why don't scientists trust atoms? Because they make up everything!",
      "Why did the scarecrow win an award? He was outstanding in his field!",
      "Why don't eggs tell jokes? They'd crack each other up!",
      "What do you call a fake noodle? An impasta!"
    ];
    
    const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
    await message.reply(`😄 ${randomJoke}`);
  }

  async handleWeather(args, message) {
    if (!args[0]) {
      await message.reply('❌ Please specify a city\nUsage: .weather <city>');
      return;
    }

    const city = args.join(' ');
    
    try {
      // Mock weather API call
      const weather = await this.getWeather(city);
      
      const response = `🌤️ **Weather in ${city}**\n\n` +
        `🌡️ Temperature: ${weather.temp}°C\n` +
        `☁️ Condition: ${weather.condition}\n` +
        `💨 Wind: ${weather.wind} km/h\n` +
        `💧 Humidity: ${weather.humidity}%`;
      
      await message.reply(response);
    } catch (error) {
      await message.reply(`❌ Could not get weather for ${city}`);
    }
  }

  async handleRemind(args, message) {
    if (args.length < 2) {
      await message.reply('❌ Usage: .remind <minutes> <message>');
      return;
    }

    const minutes = parseInt(args[0]);
    if (isNaN(minutes) || minutes < 1 || minutes > 1440) {
      await message.reply('❌ Minutes must be between 1 and 1440 (24 hours)');
      return;
    }

    const reminderText = args.slice(1).join(' ');
    const delay = minutes * 60 * 1000;

    await message.reply(`⏰ Reminder set for ${minutes} minute(s): "${reminderText}"`);

    setTimeout(async () => {
      await message.reply(`🔔 **Reminder**: ${reminderText}`);
    }, delay);
  }

  async getWeather(city) {
    // Mock weather data - replace with real API
    return {
      temp: Math.floor(Math.random() * 30) + 5,
      condition: ['Sunny', 'Cloudy', 'Rainy', 'Snowy'][Math.floor(Math.random() * 4)],
      wind: Math.floor(Math.random() * 20) + 5,
      humidity: Math.floor(Math.random() * 40) + 30
    };
  }

  getCommands() {
    return this.commands;
  }

  async process(message) {
    return message;
  }
}
```

### Interactive Command with State

```javascript
export class InteractiveModule {
  constructor() {
    this.name = 'interactive';
    this.description = 'Interactive commands with state';
    this.commands = {};
    this.userSessions = new Map();
    this.setupCommands();
  }

  setupCommands() {
    this.commands['quiz'] = {
      handler: this.handleQuiz.bind(this),
      description: 'Start an interactive quiz',
      usage: '.quiz',
      adminOnly: false
    };
  }

  async handleQuiz(args, message) {
    const userId = message.author.id;
    
    // Check if user already has active session
    if (this.userSessions.has(userId)) {
      await message.reply('❌ You already have an active quiz. Finish it first!');
      return;
    }

    // Start new quiz session
    const questions = [
      { question: "What's 2 + 2?", answer: "4" },
      { question: "What's the capital of France?", answer: "paris" },
      { question: "How many days in a week?", answer: "7" }
    ];

    this.userSessions.set(userId, {
      questions,
      currentQuestion: 0,
      score: 0,
      chatId: message.chatId
    });

    await this.askQuestion(userId);
  }

  async askQuestion(userId) {
    const session = this.userSessions.get(userId);
    if (!session) return;

    const question = session.questions[session.currentQuestion];
    const questionNumber = session.currentQuestion + 1;
    const totalQuestions = session.questions.length;

    const chat = await this.getClient().fetchChat(session.chatId);
    await chat.sendMessage(
      `❓ **Question ${questionNumber}/${totalQuestions}**\n\n${question.question}`
    );
  }

  async process(message) {
    const userId = message.author.id;
    const session = this.userSessions.get(userId);

    // Handle quiz answers
    if (session && !message.content?.startsWith('.')) {
      await this.handleQuizAnswer(message, session);
    }

    return message;
  }

  async handleQuizAnswer(message, session) {
    const userAnswer = message.content.toLowerCase().trim();
    const correctAnswer = session.questions[session.currentQuestion].answer.toLowerCase();

    if (userAnswer === correctAnswer) {
      session.score++;
      await message.reply('✅ Correct!');
    } else {
      await message.reply(`❌ Wrong! The answer was: ${correctAnswer}`);
    }

    session.currentQuestion++;

    // Check if quiz is finished
    if (session.currentQuestion >= session.questions.length) {
      const percentage = Math.round((session.score / session.questions.length) * 100);
      
      await message.reply(
        `🎉 **Quiz Complete!**\n\n` +
        `Score: ${session.score}/${session.questions.length} (${percentage}%)\n` +
        `${percentage >= 70 ? 'Great job! 🌟' : 'Better luck next time! 💪'}`
      );

      this.userSessions.delete(message.author.id);
    } else {
      // Ask next question
      setTimeout(() => {
        this.askQuestion(message.author.id);
      }, 1500);
    }
  }

  getClient() {
    return this.moduleManager.getModule('core').instagramBot.client;
  }

  getCommands() {
    return this.commands;
  }

  async cleanup() {
    this.userSessions.clear();
  }
}
```

## Event Handling

### Comprehensive Event Listener

```javascript
// Setup comprehensive event handling
bot.client.on('messageCreate', async (message) => {
  console.log(`📨 New message from @${message.author.username}`);
});

bot.client.on('messageReceived', async (message) => {
  console.log(`📥 Received: ${message.content}`);
  
  // Auto-react to messages with keywords
  if (message.content?.includes('awesome')) {
    await message.like();
  }
});

bot.client.on('messageSent', async (message) => {
  console.log(`📤 Sent: ${message.content}`);
});

bot.client.on('ready', () => {
  console.log(`🚀 Bot ready as @${bot.client.user.username}`);
});

bot.client.on('disconnect', () => {
  console.log('🔌 Bot disconnected');
});

bot.client.on('error', (error) => {
  console.error('❌ Bot error:', error.message);
});
```

### Custom Event System

```javascript
export class EventSystemModule {
  constructor() {
    this.name = 'events';
    this.description = 'Custom event system';
    this.commands = {};
    this.eventListeners = new Map();
    this.setupCommands();
  }

  setupCommands() {
    this.commands['listen'] = {
      handler: this.handleListen.bind(this),
      description: 'Listen for specific words',
      usage: '.listen <word>',
      adminOnly: false
    };

    this.commands['unlisten'] = {
      handler: this.handleUnlisten.bind(this),
      description: 'Stop listening for a word',
      usage: '.unlisten <word>',
      adminOnly: false
    };
  }

  async handleListen(args, message) {
    if (!args[0]) {
      await message.reply('❌ Please specify a word to listen for');
      return;
    }

    const word = args[0].toLowerCase();
    const userId = message.author.id;

    if (!this.eventListeners.has(userId)) {
      this.eventListeners.set(userId, new Set());
    }

    this.eventListeners.get(userId).add(word);
    await message.reply(`👂 Now listening for "${word}"`);
  }

  async handleUnlisten(args, message) {
    if (!args[0]) {
      await message.reply('❌ Please specify a word to stop listening for');
      return;
    }

    const word = args[0].toLowerCase();
    const userId = message.author.id;
    const userListeners = this.eventListeners.get(userId);

    if (userListeners && userListeners.has(word)) {
      userListeners.delete(word);
      await message.reply(`🔇 Stopped listening for "${word}"`);
    } else {
      await message.reply(`❌ Not listening for "${word}"`);
    }
  }

  async process(message) {
    if (message.fromBot || !message.hasText) return message;

    const content = message.content.toLowerCase();

    // Check all user listeners
    for (const [userId, words] of this.eventListeners) {
      for (const word of words) {
        if (content.includes(word)) {
          await this.notifyUser(userId, word, message);
        }
      }
    }

    return message;
  }

  async notifyUser(userId, word, originalMessage) {
    try {
      const user = await this.getClient().fetchUser(userId);
      await user.send(
        `🔔 **Word Alert**: "${word}"\n\n` +
        `From: @${originalMessage.author.username}\n` +
        `Message: ${originalMessage.content}`
      );
    } catch (error) {
      console.error('Failed to notify user:', error);
    }
  }

  getClient() {
    return this.moduleManager.getModule('core').instagramBot.client;
  }

  getCommands() {
    return this.commands;
  }

  async cleanup() {
    this.eventListeners.clear();
  }
}
```

This comprehensive examples guide demonstrates the power and flexibility of the enhanced Instagram bot framework. You can combine these patterns to create sophisticated automation and interaction systems.