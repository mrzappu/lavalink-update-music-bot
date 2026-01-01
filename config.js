module.exports = {
  // Bot Configuration
  token: process.env.DISCORD_BOT_TOKEN,
  prefix: '!',
  enablePrefix: true, 
  
  OWNER_ID: process.env.OWNER_ID || '944870216733716481',

  // NEW: Channel ID where the permanent status embed will live
  LAVALINK_STATUS_CHANNEL_ID: '1442844239992979549', 

  activity: {
    name: 'INFINITY MUSIC',
    type: 'LISTENING' 
  },

  lavalink: {
    nodes: [{
      name: 'Rick_Music', 
      url: 'pnode1.danbot.host:1351', 
      auth: 'cocaine', 
      secure: false, 
    }],
    defaultSearchEngine: 'youtube_music'
  },

  express: {
    port: 3000, 
    host: '0.0.0.0', 
  },
  
  support: {
    server: process.env.SUPPORT_SERVER || 'https://discord.gg/YABAKcjJhC'
  },

  emojis: {
    play: '<a:play:1443619986907336785>',
    pause: '<a:pause:1443620907233837066>',
    resume: '<a:resume:1443619986907336785>',
    skip: '<a:skip:1443619983409287221>',
    stop: '<a:stop:1443619980859015354>',
    loop: '<a:loop:1443619976400343100>',
    volume: '<a:volume:1443619978636034099>',
    nowplaying: '<a:np:1443621459057578005>',
    queue: '<a:queue:1443622469423464549>',
    shuffle: '<a:shuffle:1443619973216862461>',
    seek: '<a:seek:1393210917755424789>', 
    remove: '<a:remove:1443622707873976411>', 
    clear: '<a:clear:1443622995359694849>', 
    success: '✅',
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    warning: '⚠️',
  },
};
