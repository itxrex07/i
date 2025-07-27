export const config = {
  instagram: {
    username: 'itxrey', // Your Instagram username
    password: 'your_instagram_password', // Your Instagram password
    sessionPath: './session/session.json',
    messageCheckInterval: 5000, // Check for messages every 5 seconds
    maxRetries: 3,
    useMongoSession: true, // Set to false to use file-based sessions
    disableReplyPrefix: false, // Whether to disable @ mentions in replies
    autoApprovePending: true, // Auto-approve pending message requests
    autoApproveFollowRequests: false // Auto-approve follow requests
  },
  
  telegram: {
    botToken: '7580382614:AAH30PW6TFmgRzbC7HUXIHQ35GpndbJOIEI',
    chatId: '-1002287300661',
    bridgeGroupId: '-1002287300661',
    enabled: true,
    adminPassword: '1122',   
    forwardMessages: true,
    forwardMedia: true,
    autoApprovePending: true // Control auto-approval via Telegram
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
