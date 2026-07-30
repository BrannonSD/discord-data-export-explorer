const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Parse Command Line Arguments for --package
let packageDir = '';
const packageArgIdx = process.argv.indexOf('--package');
if (packageArgIdx !== -1 && process.argv[packageArgIdx + 1]) {
  packageDir = path.resolve(process.argv[packageArgIdx + 1]);
}

let dataCache = {
  account: null,
  channels: [],
  servers: {},
  messages: {}, // channelId -> array of messages (sorted oldest -> newest)
  isIndexed: false,
  indexingError: null
};

// Helper: Safely read JSON
function readJsonFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`[Error] Failed to read JSON at ${filePath}:`, err.message);
  }
  return null;
}

// Clean usernames: strip "Direct Message with " and useless "#0" / "#0000" discriminators
function cleanUsername(name) {
  if (!name) return '';
  let cleaned = String(name).trim();
  cleaned = cleaned.replace(/^Direct Message with\s+/i, '');
  cleaned = cleaned.replace(/#(0|0000)$/, '');
  return cleaned;
}

// Multi-Source Deleted User ID Recovery Engine
async function recoverDeletedUserIds(targetDir, deletedDmChannelIds, myUserId) {
  const recoveredMap = new Map(); // channelId -> recipientUserId
  const targetSet = new Set(deletedDmChannelIds);

  if (targetSet.size === 0) return recoveredMap;

  // Source 1: Scan messages and attachment URLs
  for (const channelId of targetSet) {
    const mPath = path.join(targetDir, 'Messages', `c${channelId}`, 'messages.json');
    if (fs.existsSync(mPath)) {
      const msgs = readJsonFile(mPath) || [];
      for (const m of msgs) {
        const textMatch = (m.Contents || '').match(/<@!?(\d{17,19})>/);
        if (textMatch && String(textMatch[1]) !== String(myUserId)) {
          recoveredMap.set(channelId, String(textMatch[1]));
          targetSet.delete(channelId);
          break;
        }
        const attMatch = (m.Attachments || '').match(/\/attachments\/\d+\/(\d{17,19})\//);
        if (attMatch && String(attMatch[1]) !== String(channelId)) {
          recoveredMap.set(channelId, String(attMatch[1]));
          targetSet.delete(channelId);
          break;
        }
      }
    }
  }

  // Source 2: Telemetry Activity Logs
  if (targetSet.size > 0) {
    const activityDir = path.join(targetDir, 'Activity');
    const logFiles = [];

    function findLogFiles(dir) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) findLogFiles(full);
        else if (entry.name.endsWith('.json')) logFiles.push(full);
      }
    }
    findLogFiles(activityDir);

    for (const file of logFiles) {
      if (targetSet.size === 0) break;
      try {
        const fileStream = fs.createReadStream(file);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        for await (const line of rl) {
          if (targetSet.size === 0) break;
          for (const channelId of targetSet) {
            if (line.includes(channelId)) {
              try {
                const obj = JSON.parse(line);
                const rIds = obj._governance_meta?.reporting?.recipient_ids || obj.recipient_ids || [];
                const otherId = rIds.find(id => String(id) !== String(myUserId) && String(id) !== 'Deleted User');
                if (otherId) {
                  recoveredMap.set(channelId, String(otherId));
                  targetSet.delete(channelId);
                  break;
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {
        console.error(`[Recovery Error] File ${file}:`, e.message);
      }
    }
  }

  return recoveredMap;
}

// Indexing Engine
async function indexPackage(targetDir) {
  packageDir = path.resolve(targetDir);
  console.log(`[Indexing] Loading Discord Data Package from: ${packageDir}...`);

  if (!fs.existsSync(packageDir)) {
    dataCache.isIndexed = false;
    dataCache.indexingError = `Specified package directory does not exist: ${packageDir}`;
    return false;
  }

  try {
    // 1. Load Account Info
    const userPath = path.join(packageDir, 'Account', 'user.json');
    dataCache.account = readJsonFile(userPath);
    if (dataCache.account) {
      dataCache.account.username = cleanUsername(dataCache.account.username);
      dataCache.account.global_name = cleanUsername(dataCache.account.global_name);
    }

    // 2. Load Servers Index
    const serversPath = path.join(packageDir, 'Servers', 'index.json');
    dataCache.servers = readJsonFile(serversPath) || {};

    // 3. Load Messages Index
    const indexMsgPath = path.join(packageDir, 'Messages', 'index.json');
    const messagesIndex = readJsonFile(indexMsgPath) || {};

    // 4. Read All Message Channel Folders
    const messagesDir = path.join(packageDir, 'Messages');
    const channels = [];
    dataCache.messages = {};

    const deletedDmChannelIds = [];

    if (fs.existsSync(messagesDir)) {
      const entries = fs.readdirSync(messagesDir);

      for (const entry of entries) {
        const folderPath = path.join(messagesDir, entry);
        if (fs.statSync(folderPath).isDirectory()) {
          const channelJsonPath = path.join(folderPath, 'channel.json');
          const messagesJsonPath = path.join(folderPath, 'messages.json');

          const channelInfo = readJsonFile(channelJsonPath);
          const messages = readJsonFile(messagesJsonPath) || [];

          if (channelInfo || messages.length > 0) {
            const channelId = channelInfo?.id || entry.replace(/^c/, '');
            const indexedDesc = messagesIndex[channelId] || '';

            let type = channelInfo?.type || 'UNKNOWN';
            let rawName = channelInfo?.name || '';
            if (!rawName) {
              rawName = indexedDesc || `Channel ${channelId}`;
            }

            let name = cleanUsername(rawName);

            let guildName = channelInfo?.guild?.name || '';
            let guildId = channelInfo?.guild?.id || '';

            if (guildId && !guildName && dataCache.servers[guildId]) {
              guildName = dataCache.servers[guildId];
            }

            let recipients = channelInfo?.recipients || [];
            let recipientId = null;
            let recipientHandle = '';
            let isDeletedUser = false;

            const myUserId = dataCache.account?.id || '';

            if (type === 'DM' || indexedDesc.startsWith('Direct Message with')) {
              type = 'DM';
              if (recipients.length > 0) {
                recipientId = recipients.find(id => String(id) !== String(myUserId)) || recipients[0];
              }
              const match = indexedDesc.match(/^Direct Message with (.+)$/);
              if (match) {
                recipientHandle = cleanUsername(match[1]);
                if (!name || name === `Channel ${channelId}` || name.startsWith('Direct Message with')) {
                  name = recipientHandle.startsWith('@') ? recipientHandle : `@${recipientHandle}`;
                }
              }

              if (recipientId === 'Deleted User' || !recipientId || recipientHandle.includes('Unknown Participant')) {
                isDeletedUser = true;
                deletedDmChannelIds.push(String(channelId));
              }
            } else if (type === 'GROUP_DM' || indexedDesc.startsWith('Group DM')) {
              type = 'GROUP_DM';
            }

            // Sort messages chronologically: oldest first [0] -> newest last [length-1]
            messages.sort((a, b) => new Date(a.Timestamp || 0) - new Date(b.Timestamp || 0));
            dataCache.messages[channelId] = messages;

            const firstMsg = messages[0];
            const lastMsg = messages[messages.length - 1];

            channels.push({
              id: String(channelId),
              folderName: entry,
              type,
              name,
              guildId: String(guildId),
              guildName,
              recipients,
              recipientId: recipientId ? String(recipientId) : null,
              recipientHandle,
              isDeletedUser,
              isRecovered: false,
              indexedDesc,
              messageCount: messages.length,
              firstMessageTimestamp: firstMsg?.Timestamp || null,
              lastMessageTimestamp: lastMsg?.Timestamp || null
            });
          }
        }
      }
    }

    // 5. Run Multi-Source Recovery for Deleted Users
    if (deletedDmChannelIds.length > 0) {
      console.log(`[Recovery Engine] Scanning multi-source logs for ${deletedDmChannelIds.length} Deleted User DMs...`);
      const recoveredMap = await recoverDeletedUserIds(packageDir, deletedDmChannelIds, dataCache.account?.id || '');
      
      for (const ch of channels) {
        if (ch.isDeletedUser && recoveredMap.has(ch.id)) {
          ch.recipientId = recoveredMap.get(ch.id);
          ch.isRecovered = true;
          console.log(`[Recovered User ID] DM ${ch.id} -> ${ch.recipientId}`);
        }
      }
    }

    // Sort channels by last active message
    channels.sort((a, b) => new Date(b.lastMessageTimestamp || 0) - new Date(a.lastMessageTimestamp || 0));

    dataCache.channels = channels;
    dataCache.isIndexed = true;
    dataCache.indexingError = null;

    console.log(`[Success] Indexed ${channels.length} channels and DMs.`);
    return true;

  } catch (err) {
    console.error('[Error] Package indexing failed:', err);
    dataCache.isIndexed = false;
    dataCache.indexingError = err.message;
    return false;
  }
}

// Serve User Avatar File from Account directory
app.get('/api/account/avatar', (req, res) => {
  if (!packageDir) return res.status(404).send('No package loaded');
  const accountDir = path.join(packageDir, 'Account');
  const possibleAvatars = ['avatar.gif', 'avatar.png', 'avatar.jpg', 'avatar.webp'];

  for (const file of possibleAvatars) {
    const fullPath = path.join(accountDir, file);
    if (fs.existsSync(fullPath)) {
      return res.sendFile(fullPath);
    }
  }

  res.status(404).send('Avatar not found');
});

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    isIndexed: dataCache.isIndexed,
    packageDir,
    error: dataCache.indexingError,
    totalChannels: dataCache.channels.length
  });
});

app.get('/api/account', (req, res) => {
  res.json({
    ...dataCache.account,
    packageDir
  });
});

app.get('/api/channels', (req, res) => {
  res.json({
    total: dataCache.channels.length,
    packageDir,
    isIndexed: dataCache.isIndexed,
    channels: dataCache.channels
  });
});

// Paginated messages
app.get('/api/channel/:id/messages', (req, res) => {
  const channelId = req.params.id;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const search = req.query.search ? req.query.search.toLowerCase() : null;

  let messages = dataCache.messages[channelId] || [];

  if (search) {
    messages = messages.filter(m => (m.Contents || '').toLowerCase().includes(search));
  }

  const total = messages.length;
  const endIndex = Math.max(0, total - offset);
  const startIndex = Math.max(0, total - offset - limit);

  const paginated = messages.slice(startIndex, endIndex);
  const channelMeta = dataCache.channels.find(c => String(c.id) === String(channelId));

  res.json({
    channelId,
    channelMeta,
    totalMessages: total,
    offset,
    limit,
    messages: paginated,
    hasMore: startIndex > 0
  });
});

app.get('/api/search', (req, res) => {
  const query = req.query.q ? req.query.q.trim().toLowerCase() : '';
  const limit = parseInt(req.query.limit) || 100;

  if (!query) {
    return res.json({ results: [], total: 0 });
  }

  const results = [];

  for (const [channelId, msgs] of Object.entries(dataCache.messages)) {
    const channelMeta = dataCache.channels.find(c => String(c.id) === String(channelId));
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];
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
    topDms: topDms.slice(0, 10),
    topGuilds: topGuilds.slice(0, 10)
  });
});

app.post('/api/set-package-path', async (req, res) => {
  const { newPath } = req.body;
  if (!newPath || !fs.existsSync(newPath)) {
    return res.status(400).json({ error: 'Invalid or non-existent path.' });
  }

  const success = await indexPackage(newPath);
  if (success) {
    res.json({
      success: true,
      message: `Loaded Discord package from ${packageDir}`,
      totalChannels: dataCache.channels.length,
      packageDir
    });
  } else {
    res.status(500).json({ error: dataCache.indexingError || 'Failed to index package.' });
  }
});

if (packageDir) {
  indexPackage(packageDir);
}

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Discord Data Export Explorer Running!`);
  console.log(`👉 Access Web UI: http://localhost:${PORT}`);
  if (packageDir) console.log(`📂 Package Directory: ${packageDir}`);
  console.log(`==================================================\n`);
});
