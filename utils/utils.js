import fs from 'fs-extra';
import path from 'path';

// Simple logger utility
export const logger = {
  info: (message, ...args) => {
    console.log(`[${new Date().toISOString()}] ℹ️  ${message}`, ...args);
  },
  
  error: (message, ...args) => {
    console.error(`[${new Date().toISOString()}] ❌ ${message}`, ...args);
  },
  
  warn: (message, ...args) => {
    console.warn(`[${new Date().toISOString()}] ⚠️  ${message}`, ...args);
  },
  
  debug: (message, ...args) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[${new Date().toISOString()}] 🐛 ${message}`, ...args);
    }
  }
};

// File utilities
export const fileUtils = {
  async ensureDir(dirPath) {
    await fs.ensureDir(dirPath);
  },
  
  async readJson(filePath) {
    try {
      return await fs.readJson(filePath);
    } catch (error) {
      return null;
    }
  },
  
  async writeJson(filePath, data) {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeJson(filePath, data, { spaces: 2 });
  },
  
  async pathExists(filePath) {
    return await fs.pathExists(filePath);
  }
};

// Message utilities
export const messageUtils = {
  formatMessage(message) {
    return {
      id: message.id,
      text: message.text || '',
      sender: message.senderUsername || 'Unknown',
      displayName: message.senderDisplayName || message.senderUsername || 'Unknown',
      timestamp: message.timestamp,
      thread: message.threadTitle || 'Direct Message',
      type: message.type || 'text'
    };
  },
  
  isSpam(text, spamKeywords) {
    if (!text || !spamKeywords.length) return false;
    
    const lowerText = text.toLowerCase();
    return spamKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  },
  
  containsGreeting(text, greetings) {
    if (!text || !greetings.length) return false;
    
    const lowerText = text.toLowerCase();
    return greetings.some(greeting => lowerText.includes(greeting.toLowerCase()));
  }

  /**
   * Check if query is an ID (from original insta.js Util)
   * @param {string} query - The query to check
   * @returns {boolean}
   */
  isID(query) {
    return !isNaN(query);
  },

  /**
   * Match admin path (from original insta.js Util)
   * @param {string} query - URL path to match
   * @param {boolean} extract - Whether to return extracted data
   * @returns {string[]|boolean}
   */
  matchAdminPath(query, extract) {
    const isMatched = /\/direct_v2\/threads\/(\d+)\/admin_user_ids\/(\d+)/.test(query);
    return extract ? query.match(/\/direct_v2\/threads\/(\d+)\/admin_user_ids\/(\d+)/).slice(1) : isMatched;
  },

  /**
   * Match message path (from original insta.js Util)
   * @param {string} query - URL path to match
   * @param {boolean} extract - Whether to return extracted data
   * @returns {string[]|boolean}
   */
  matchMessagePath(query, extract) {
    const isMatched = /\/direct_v2\/threads\/(\d+)\/items\/(\d+)/.test(query);
    return extract ? query.match(/\/direct_v2\/threads\/(\d+)\/items\/(\d+)/).slice(1) : isMatched;
  },

  /**
   * Match inbox thread path (from original insta.js Util)
   * @param {string} query - URL path to match
   * @param {boolean} extract - Whether to return extracted data
   * @returns {string[]|boolean}
   */
  matchInboxThreadPath(query, extract) {
    const isMatched = /\/direct_v2\/inbox\/threads\/(\d+)/.test(query);
    return extract ? query.match(/\/direct_v2\/inbox\/threads\/(\d+)/).slice(1) : isMatched;
  },

  /**
   * Check if message is valid (from original insta.js Util)
   * @param {Message} message - The message to check
   * @returns {boolean}
   */
  isMessageValid(message) {
    return ((message.timestamp / 1000) + 10000) > Date.now();
  }
};

// Random utilities
export const randomUtils = {
  choice(array) {
    return array[Math.floor(Math.random() * array.length)];
  },
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};
