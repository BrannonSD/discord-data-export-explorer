const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Parse command line arguments for package path
let PACKAGE_DIR = process.env.DISCORD_PACKAGE_PATH || '';

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--package' || process.argv[i] === '-p') {
    PACKAGE_DIR = process.argv[i + 1] || '';
    break;
  } else if (!process.argv[i].startsWith('-') && i === 2) {
    PACKAGE_DIR = process.argv[i];
  }
}

// Fallback to current working directory if it contains export files
if (!PACKAGE_DIR || !fs.existsSync(PACKAGE_DIR)) {
  if (fs.existsSync(path.join(process.cwd(), 'Messages'))) {
    PACKAGE_DIR = process.cwd();
  }
}

let dataCache = {
  account: null,
  channels: [],
  servers: {},
  messagesCache: new Map(), // channelId -> messages array
  isIndexed: false,
  indexingError: null,
  packageDir: PACKAGE_DIR
};

// Helper to safely read JSON
function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`[Error] Failed reading JSON from ${filePath}:`, err.message);
  }
  return null;
}

// Index Discord Export Package Data
function indexPackageData() {
  if (!PACKAGE_DIR || !fs.existsSync(PACKAGE_DIR)) {
    console.log(`[Info] No valid Discord export directory selected yet.`);
    dataCache.isIndexed = false;
    dataCache.channels = [];
    dataCache.account = null;
    return;
  }

  console.log(`[Indexing] Loading Discord Data Package from: ${PACKAGE_DIR}...`);
  try {
    // 1. Account Info
    const userJsonPath = path.join(PACKAGE_DIR, 'Account', 'user.json');
    dataCache.account = readJson(userJsonPath) || {};

    // 2. Servers Index
    const serversIndexPath = path.join(PACKAGE_DIR, 'Servers', 'index.json');
    dataCache.servers = readJson(serversIndexPath) || {};

    // 3. Messages Index
    const messagesIndexPath = path.join(PACKAGE_DIR, 'Messages', 'index.json');
    const messagesIndex = readJson(messagesIndexPath) || {};

    // 4. Scan Messages Folder
    const messagesDir = path.join(PACKAGE_DIR, 'Messages');
    const channels = [];
    dataCache.messagesCache.clear();

    if (fs.existsSync(messagesDir)) {
      const entries = fs.readdirSync(messagesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const folderPath = path.join(messagesDir, entry.name);
          const channelJsonPath = path.join(folderPath, 'channel.json');
          const messagesJsonPath = path.join(folderPath, 'messages.json');

          const channelInfo = readJson(channelJsonPath);
          const messages = readJson(messagesJsonPath) || [];

          if (channelInfo || messages.length > 0) {
            const channelId = channelInfo?.id || entry.name.replace(/^c/, '');
            const indexedDesc = messagesIndex[channelId] || '';
            
            let type = channelInfo?.type || 'UNKNOWN';
            let name = channelInfo?.name || indexedDesc || `Channel ${channelId}`;
            let guildName = channelInfo?.guild?.name || '';
            let guildId = channelInfo?.guild?.id || '';

            if (guildId && !guildName && dataCache.servers[guildId]) {
              guildName = dataCache.servers[guildId];
            }

            let recipients = channelInfo?.recipients || [];
            let recipientId = null;
            let recipientHandle = '';

            const myUserId = dataCache.account?.id || '';

            if (type === 'DM' || indexedDesc.startsWith('Direct Message with')) {
              type = 'DM';
              if (recipients.length > 0) {
                recipientId = recipients.find(id => String(id) !== String(myUserId)) || recipients[0];
              }
              const match = indexedDesc.match(/^Direct Message with (.+)$/);
              if (match) {
                recipientHandle = match[1];
                if (!name || name === `Channel ${channelId}`) {
                  name = `@${recipientHandle}`;
                }
              }
            } else if (type === 'GROUP_DM' || indexedDesc.startsWith('Group DM')) {
              type = 'GROUP_DM';
            }

            messages.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
            dataCache.messagesCache.set(channelId, messages);

            channels.push({
              id: channelId,
              folderName: entry.name,
              type,
              name,
              guildId,
              guildName,
              recipients,
              recipientId,
              recipientHandle,
              indexedDesc,
              messageCount: messages.length,
              firstMessageTimestamp: messages[0]?.Timestamp || null,
              lastMessageTimestamp: messages[messages.length - 1]?.Timestamp || null
            });
          }
        }
      }
    }

    channels.sort((a, b) => {
      const timeA = a.lastMessageTimestamp ? new Date(a.lastMessageTimestamp).getTime() : 0;
      const timeB = b.lastMessageTimestamp ? new Date(b.lastMessageTimestamp).getTime() : 0;
      return timeB - timeA;
    });

    dataCache.channels = channels;
    dataCache.isIndexed = true;
    dataCache.indexingError = null;
    dataCache.packageDir = PACKAGE_DIR;
    console.log(`[Success] Indexed ${channels.length} channels and DMs.`);
  } catch (err) {
    console.error('[Error] Indexing error:', err);
    dataCache.indexingError = err.message;
    dataCache.isIndexed = false;
  }
}

// Initial index attempt
indexPackageData();

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    isIndexed: dataCache.isIndexed,
    packageDir: PACKAGE_DIR,
    error: dataCache.indexingError,
    totalChannels: dataCache.channels.length
  });
});

app.get('/api/account', (req, res) => {
  res.json({
    id: dataCache.account?.id || '',
    username: dataCache.account?.username || 'User',
    global_name: dataCache.account?.global_name || dataCache.account?.username || 'Discord User',
    email: dataCache.account?.email || '',
    avatar_hash: dataCache.account?.avatar_hash || '',
    packageDir: PACKAGE_DIR
  });
});

app.get('/api/channels', (req, res) => {
  res.json({
    total: dataCache.channels.length,
    packageDir: PACKAGE_DIR,
    isIndexed: dataCache.isIndexed,
    channels: dataCache.channels
  });
});

app.get('/api/channel/:id/messages', (req, res) => {
  const channelId = req.params.id;
  const messages = dataCache.messagesCache.get(channelId);

  if (!messages) {
    return res.status(404).json({ error: 'Channel not found or has no messages.' });
  }

  let filtered = messages;
  const searchQuery = req.query.search ? req.query.search.toLowerCase() : '';

  if (searchQuery) {
    filtered = messages.filter(m => (m.Contents || '').toLowerCase().includes(searchQuery));
  }

  const offset = parseInt(req.query.offset) || 0;
  const limit = parseInt(req.query.limit) || 100;
  const paginated = filtered.slice(offset, offset + limit);

  const channelMeta = dataCache.channels.find(c => String(c.id) === String(channelId));

  res.json({
    channelId,
    channelMeta,
    totalMessages: filtered.length,
    offset,
    limit,
    messages: paginated
  });
});

app.get('/api/search', (req, res) => {
  const query = (req.query.q || '').trim().toLowerCase();
  if (!query) {
    return res.json({ results: [], total: 0 });
  }

  const results = [];
  const limit = parseInt(req.query.limit) || 100;

  for (const [channelId, messages] of dataCache.messagesCache.entries()) {
    const channelMeta = dataCache.channels.find(c => String(c.id) === String(channelId));
    
    for (const msg of messages) {
      if ((msg.Contents || '').toLowerCase().includes(query)) {
        results.push({
          channelId,
          channelName: channelMeta?.name || `Channel ${channelId}`,
          guildName: channelMeta?.guildName || '',
          type: channelMeta?.type || 'UNKNOWN',
          recipientId: channelMeta?.recipientId || null,
          recipientHandle: channelMeta?.recipientHandle || '',
          message: msg
        });
        if (results.length >= limit) break;
      }
    }
    if (results.length >= limit) break;
  }

  res.json({
    query,
    total: results.length,
    results
  });
});

app.get('/api/stats', (req, res) => {
  let totalMessages = 0;
  let dmCount = 0;
  let guildChannelCount = 0;

  const topDms = [];
  const topGuildsMap = {};

  for (const ch of dataCache.channels) {
    totalMessages += ch.messageCount;
    if (ch.type === 'DM') {
      dmCount++;
      topDms.push(ch);
    } else {
      guildChannelCount++;
      if (ch.guildName) {
        topGuildsMap[ch.guildName] = (topGuildsMap[ch.guildName] || 0) + ch.messageCount;
      }
    }
  }

  topDms.sort((a, b) => b.messageCount - a.messageCount);

  const topGuilds = Object.entries(topGuildsMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  res.json({
    totalMessages,
    totalChannels: dataCache.channels.length,
    dmCount,
    guildChannelCount,
    topDms: topDms.slice(0, 10).map(d => ({
      id: d.id,
      name: d.name,
      recipientId: d.recipientId,
      recipientHandle: d.recipientHandle,
      messageCount: d.messageCount
    })),
    topGuilds: topGuilds.slice(0, 10)
  });
});

app.post('/api/set-package-path', (req, res) => {
  let { newPath } = req.body;
  if (!newPath || !fs.existsSync(newPath)) {
    return res.status(400).json({ error: 'Invalid or non-existent folder path provided.' });
  }

  PACKAGE_DIR = path.resolve(newPath);
  indexPackageData();

  if (dataCache.indexingError) {
    return res.status(500).json({ error: dataCache.indexingError });
  }

  res.json({
    success: true,
    message: `Loaded Discord package from ${PACKAGE_DIR}`,
    totalChannels: dataCache.channels.length,
    packageDir: PACKAGE_DIR
  });
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Discord Data Export Explorer Running!`);
  console.log(`👉 Access Web UI: http://localhost:${PORT}`);
  if (PACKAGE_DIR) {
    console.log(`📂 Package Directory: ${PACKAGE_DIR}`);
  } else {
    console.log(`📂 Package Directory: [Not selected yet - use GUI launcher or web UI]`);
  }
  console.log(`==================================================\n`);
});
