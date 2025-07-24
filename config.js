export const config = {
  instagram: {
    username: 'itxrey', // Your Instagram username
    password: 'your_instagram_password', // Your Instagram password
    sessionPath: './session/session.json',
    messageCheckInterval: 5000, // Check for messages every 5 seconds
    maxRetries: 3,
    useMongoSession: true // Set to false to use file-based sessions
  },
  
  telegram: {
    botToken: '7580382614:AAH30PW6TFmgRzbC7HUXIHQ35GpndbJOIEI',
    chatId: '-1002710686896',
    enabled: false,
    forwardMessages: true,
    forwardMedia: true
  },
  
  mongo: {
    uri: 'mongodb+srv://itxelijah07:ivp8FYGsbVfjQOkj@cluster0.wh25x.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
    dbName: 'hyper_insta',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },
  
  modules: {

  },
  
  admin: {
    users: ['itxrey', 'iarshman'] // Admin usernames
  },
  
  app: {
    logLevel: 'info',
    environment: 'development'
  }
};
