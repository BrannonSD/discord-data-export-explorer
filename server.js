const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const app = express();
// Parse Command Line Arguments for --package and --port
let packageDir = '';
const packageArgIdx = process.argv.indexOf('--package');
if (packageArgIdx !== -1 && process.argv[packageArgIdx + 1]) {
  packageDir = path.resolve(process.argv[packageArgIdx + 1]);
}

let port = parseInt(process.env.PORT) || 3000;
const portArgIdx = process.argv.indexOf('--port');
if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
  port = parseInt(process.argv[portArgIdx + 1]) || port;
}
const PORT = port;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let dataCache = {
  account: null,
  channels: [],
  servers: {},
  messages: {}, // channelId -> array of messages (sorted oldest -> newest)
  activity: [],
  relationships: [],
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

// Robust RFC 4180 CSV Parser for Discord messages.csv exports
function parseDiscordCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentVal += '"';
          i++; // Skip escaped quote
        } else {
          insideQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentVal);
        currentVal = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentVal);
        rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else if (char === '\n') {
        currentRow.push(currentVal);
        rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }

  if (rows.length < 2) return [];

  // Parse header
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idIdx = header.findIndex(h => h === 'id' || h === 'messageid' || h === 'message_id');
  const timeIdx = header.findIndex(h => h === 'timestamp' || h === 'time' || h === 'date');
  const contentsIdx = header.findIndex(h => h === 'contents' || h === 'content' || h === 'message');
  const attIdx = header.findIndex(h => h === 'attachments' || h === 'attachment');

  const messages = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0 || (row.length === 1 && !row[0].trim())) continue;

    let id = idIdx !== -1 && row[idIdx] !== undefined ? row[idIdx].trim() : String(r);
    let rawTimestamp = timeIdx !== -1 && row[timeIdx] !== undefined ? row[timeIdx].trim() : '';
    let contents = contentsIdx !== -1 && row[contentsIdx] !== undefined ? row[contentsIdx] : '';
    let attachments = attIdx !== -1 && row[attIdx] !== undefined ? row[attIdx].trim() : '';

    let formattedTimestamp = rawTimestamp;
    if (rawTimestamp) {
      // Normalize timestamp if in format "YYYY-MM-DD HH:MM:SS"
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(rawTimestamp)) {
        formattedTimestamp = rawTimestamp.replace(' ', 'T') + 'Z';
      }
    }

    messages.push({
      ID: id,
      Timestamp: formattedTimestamp,
      Contents: contents,
      Attachments: attachments
    });
  }

  return messages;
}

// Multi-Source Deleted User ID Recovery Engine
async function recoverDeletedUserIds(targetDir, deletedDmChannelIds, myUserId) {
  const recoveredMap = new Map(); // channelId -> recipientUserId
  const targetSet = new Set(deletedDmChannelIds);

  if (targetSet.size === 0) return recoveredMap;

  // Source 1: Scan messages and attachment URLs
  for (const channelId of targetSet) {
    const folderPath = path.join(targetDir, 'Messages', `c${channelId}`);
    let msgs = [];
    const mJson = path.join(folderPath, 'messages.json');
    const mCsv = path.join(folderPath, 'messages.csv');

    if (fs.existsSync(mJson)) {
      msgs = readJsonFile(mJson) || [];
    } else if (fs.existsSync(mCsv)) {
      try {
        const csvContent = fs.readFileSync(mCsv, 'utf8');
        msgs = parseDiscordCsv(csvContent);
      } catch (e) {}
    }

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
    // 1. Load Account Info & Relationships
    const userPath = path.join(packageDir, 'Account', 'user.json');
    dataCache.account = readJsonFile(userPath) || {};
    if (dataCache.account) {
      dataCache.account.username = cleanUsername(dataCache.account.username);
      dataCache.account.global_name = cleanUsername(dataCache.account.global_name);
      dataCache.relationships = dataCache.account.relationships || [];
    }

    const relPath = path.join(packageDir, 'Account', 'relationships.json');
    if (fs.existsSync(relPath)) {
      const relData = readJsonFile(relPath);
      if (Array.isArray(relData)) dataCache.relationships = relData;
    }

    // 2. Load Servers Index
    const serversPath = path.join(packageDir, 'Servers', 'index.json');
    dataCache.servers = readJsonFile(serversPath) || {};

    // 3. Load Messages Index
    const indexMsgPath = path.join(packageDir, 'Messages', 'index.json');
    const messagesIndex = readJsonFile(indexMsgPath) || {};

    // 4. Load Activity logs
    const activityDir = path.join(packageDir, 'Activity');
    dataCache.activity = [];
    if (fs.existsSync(activityDir)) {
      try {
        const files = fs.readdirSync(activityDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(activityDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').filter(l => l.trim().length > 0);
            for (const line of lines) {
              try {
                dataCache.activity.push(JSON.parse(line));
              } catch (e) {}
            }
          }
        }
      } catch (e) {
        console.error('[Activity Error]', e.message);
      }
    }

    // 5. Read All Message Channel Folders
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
          const messagesCsvPath = path.join(folderPath, 'messages.csv');

          const channelInfo = readJsonFile(channelJsonPath);
          let messages = [];

          if (fs.existsSync(messagesJsonPath)) {
            messages = readJsonFile(messagesJsonPath) || [];
          } else if (fs.existsSync(messagesCsvPath)) {
            try {
              const csvContent = fs.readFileSync(messagesCsvPath, 'utf8');
              messages = parseDiscordCsv(csvContent);
            } catch (err) {
              console.error(`[CSV Error in ${entry}]:`, err.message);
            }
          }

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

    // 6. Run Multi-Source Recovery for Deleted Users
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

    const totalMsgs = channels.reduce((sum, c) => sum + c.messageCount, 0);
    console.log(`[Success] Indexed ${channels.length} channels (${totalMsgs.toLocaleString()} messages).`);
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
  const possibleAvatars = ['avatar.gif', 'avatar.png', 'avatar.jpg', 'avatar.jpeg', 'avatar.webp'];

  for (const file of possibleAvatars) {
    const fullPath = path.join(accountDir, file);
    if (fs.existsSync(fullPath)) {
      return res.sendFile(fullPath);
    }
  }

  res.status(404).send('Avatar not found');
});

// Serve User Banner File from Account directory
app.get('/api/account/banner', (req, res) => {
  if (!packageDir) return res.status(404).send('No package loaded');
  const accountDir = path.join(packageDir, 'Account');
  const possibleBanners = ['banner.gif', 'banner.png', 'banner.jpg', 'banner.jpeg', 'banner.webp'];

  for (const file of possibleBanners) {
    const fullPath = path.join(accountDir, file);
    if (fs.existsSync(fullPath)) {
      return res.sendFile(fullPath);
    }
  }

  res.status(404).send('Banner not found');
});

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    isIndexed: dataCache.isIndexed,
    packageDir,
    error: dataCache.indexingError,
    totalChannels: dataCache.channels.length,
    totalMessages: dataCache.channels.reduce((sum, c) => sum + c.messageCount, 0),
    version: '1.3.0'
  });
});

app.get('/api/account', (req, res) => {
  res.json({
    ...dataCache.account,
    packageDir,
    relationships: dataCache.relationships
  });
});

app.get('/api/servers', (req, res) => {
  const serversList = [];
  const guildMap = {};

  for (const [id, name] of Object.entries(dataCache.servers)) {
    guildMap[id] = {
      id,
      name,
      channels: [],
      totalMessages: 0
    };
  }

  for (const ch of dataCache.channels) {
    if (ch.guildId) {
      if (!guildMap[ch.guildId]) {
        guildMap[ch.guildId] = {
          id: ch.guildId,
          name: ch.guildName || `Server ${ch.guildId}`,
          channels: [],
          totalMessages: 0
        };
      }
      guildMap[ch.guildId].channels.push(ch);
      guildMap[ch.guildId].totalMessages += ch.messageCount;
    }
  }

  res.json({
    servers: Object.values(guildMap).sort((a, b) => b.totalMessages - a.totalMessages)
  });
});

app.get('/api/activity', (req, res) => {
  const gamesMap = {};
  let totalVoiceMinutes = 0;

  for (const item of dataCache.activity) {
    if (item.game_name || item.application_name) {
      const name = item.game_name || item.application_name;
      const duration = item.duration_minutes || (item.duration ? Math.round(item.duration / 60) : 10);
      gamesMap[name] = (gamesMap[name] || 0) + duration;
    }
    if (item.event_type === 'voice_channel_joined' || item.duration_minutes) {
      totalVoiceMinutes += item.duration_minutes || 0;
    }
  }

  const topGames = Object.entries(gamesMap)
    .map(([name, minutes]) => ({ name, minutes, hours: Number((minutes / 60).toFixed(1)) }))
    .sort((a, b) => b.minutes - a.minutes);

  res.json({
    totalEvents: dataCache.activity.length,
    topGames,
    totalVoiceMinutes
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

// Paginated messages with filter support
app.get('/api/channel/:id/messages', (req, res) => {
  const channelId = req.params.id;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const search = req.query.search ? req.query.search.trim().toLowerCase() : null;

  let messages = dataCache.messages[channelId] || [];

  if (search) {
    messages = messages.filter(m => {
      const contents = (m.Contents || '').toLowerCase();
      const atts = (m.Attachments || '').toLowerCase();
      return contents.includes(search) || atts.includes(search);
    });
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

// Advanced Global Search with filters
app.get('/api/search', (req, res) => {
  const rawQuery = req.query.q ? req.query.q.trim() : '';
  const limit = parseInt(req.query.limit) || 1000;
  const maxPerChannel = parseInt(req.query.maxPerChannel) || Math.max(50, Math.floor(limit / 5));

  if (!rawQuery) {
    return res.json({ query: '', total: 0, results: [] });
  }

  // Parse operators: has:image, has:video, has:link, has:file, from:..., before:..., after:...
  let textTerms = [];
  let filterImage = false;
  let filterVideo = false;
  let filterAudio = false;
  let filterFile = false;
  let filterLink = false;
  let filterFrom = null;
  let beforeDate = null;
  let afterDate = null;

  const tokens = rawQuery.split(/\s+/);
  for (const token of tokens) {
    if (token.startsWith('has:')) {
      const val = token.slice(4).toLowerCase();
      if (val === 'image') filterImage = true;
      else if (val === 'video') filterVideo = true;
      else if (val === 'audio') filterAudio = true;
      else if (val === 'file') filterFile = true;
      else if (val === 'link') filterLink = true;
    } else if (token.startsWith('from:')) {
      filterFrom = token.slice(5).toLowerCase();
    } else if (token.startsWith('before:')) {
      beforeDate = new Date(token.slice(7));
    } else if (token.startsWith('after:')) {
      afterDate = new Date(token.slice(6));
    } else {
      textTerms.push(token.toLowerCase());
    }
  }

  const queryText = textTerms.join(' ');
  const results = [];
  const myUserId = dataCache.account?.id || '';

  // Distribute search evenly across all channels
  for (const ch of dataCache.channels) {
    const msgs = dataCache.messages[ch.id] || [];
    let channelMatchCount = 0;

    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];
      const contents = (msg.Contents || '').toLowerCase();
      const attachments = (msg.Attachments || '').toLowerCase();
      const msgTimestamp = msg.Timestamp ? new Date(msg.Timestamp) : null;

      // Date filtering
      if (beforeDate && msgTimestamp && msgTimestamp >= beforeDate) continue;
      if (afterDate && msgTimestamp && msgTimestamp <= afterDate) continue;

      // Has media filters
      if (filterImage && !/\.(png|jpg|jpeg|webp|gif|svg)/i.test(attachments)) continue;
      if (filterVideo && !/\.(mp4|webm|mov|mkv)/i.test(attachments) && !contents.includes('youtube.com') && !contents.includes('youtu.be')) continue;
      if (filterAudio && !/\.(mp3|ogg|wav|m4a|flac)/i.test(attachments)) continue;
      if (filterFile && !attachments) continue;
      if (filterLink && !contents.includes('http://') && !contents.includes('https://')) continue;

      // From filter
      if (filterFrom) {
        const isFromMe = String(msg.AuthorID || '') === String(myUserId) || !msg.AuthorID;
        if (filterFrom === 'me' && !isFromMe) continue;
        if (filterFrom !== 'me') {
          const authorMatch = (ch.recipientHandle || '').toLowerCase().includes(filterFrom) ||
                              (ch.recipientId || '').includes(filterFrom) ||
                              (ch.name || '').toLowerCase().includes(filterFrom);
          if (!authorMatch) continue;
        }
      }

      // Text match
      if (queryText) {
        if (!contents.includes(queryText) && !attachments.includes(queryText)) continue;
      }

      results.push({
        channelId: ch.id,
        channelName: ch.name || `Channel ${ch.id}`,
        guildName: ch.guildName || '',
        type: ch.type || 'UNKNOWN',
        recipientId: ch.recipientId || null,
        recipientHandle: ch.recipientHandle || '',
        message: msg
      });

      channelMatchCount++;
      if (results.length >= limit) break;
      if (channelMatchCount >= maxPerChannel) break;
    }

    if (results.length >= limit) break;
  }

  res.json({
    query: rawQuery,
    total: results.length,
    results
  });
});

// Basic Stats
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

// Deep Advanced Analytics Studio API
app.get('/api/stats/advanced', (req, res) => {
  let totalMessages = 0;
  let totalCharacters = 0;
  let totalWords = 0;

  // Heatmap: 7 days (0-6) x 24 hours (0-23)
  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
  const monthlyMap = {};
  const yearlyMap = {};
  const dailyCountMap = {};

  const emojiMap = {};
  const wordMap = {};
  const mentionMap = {};

  const attachmentStats = {
    images: 0,
    videos: 0,
    audio: 0,
    documents: 0,
    total: 0
  };

  const stopWords = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he',
    'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or',
    'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about',
    'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
    'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
    'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two',
    'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give',
    'day', 'most', 'us', 'is', 'are', 'was', 'were', 'am', 'been', 'has', 'had', 'did', 'does', 'im', 'dont',
    'thats', 'cant', 'yeah', 'lol', 'ok', 'yes', 'no', 'http', 'https', 'com'
  ]);

  for (const ch of dataCache.channels) {
    const msgs = dataCache.messages[ch.id] || [];
    for (const m of msgs) {
      totalMessages++;
      const contents = m.Contents || '';
      const atts = m.Attachments || '';

      totalCharacters += contents.length;

      // Extract emojis: <:name:id> or <a:name:id>
      const customEmojiMatches = contents.matchAll(/<a?:([a-zA-Z0-9_]+):(\d+)>/g);
      for (const match of customEmojiMatches) {
        const key = `:${match[1]}:`;
        emojiMap[key] = (emojiMap[key] || 0) + 1;
      }

      // Extract mentions
      const mentionMatches = contents.matchAll(/<@!?(\d+)>/g);
      for (const match of mentionMatches) {
        const id = match[1];
        mentionMap[id] = (mentionMap[id] || 0) + 1;
      }

      // Tokenize words
      const words = contents.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
      totalWords += words.length;
      for (const w of words) {
        if (!stopWords.has(w)) {
          wordMap[w] = (wordMap[w] || 0) + 1;
        }
      }

      // Attachments classification
      if (atts) {
        const urls = atts.split(/\s+/).filter(u => u.length > 0);
        attachmentStats.total += urls.length;
        for (const u of urls) {
          if (/\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(u)) attachmentStats.images++;
          else if (/\.(mp4|webm|mov|mkv)(\?|$)/i.test(u)) attachmentStats.videos++;
          else if (/\.(mp3|ogg|wav|m4a|flac)(\?|$)/i.test(u)) attachmentStats.audio++;
          else attachmentStats.documents++;
        }
      }

      // Timestamps parsing
      if (m.Timestamp) {
        const date = new Date(m.Timestamp);
        if (!isNaN(date.getTime())) {
          const dayOfWeek = date.getUTCDay();
          const hour = date.getUTCHours();
          heatmap[dayOfWeek][hour]++;

          const year = date.getUTCFullYear();
          const month = `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
          const dayStr = date.toISOString().slice(0, 10);

          yearlyMap[year] = (yearlyMap[year] || 0) + 1;
          monthlyMap[month] = (monthlyMap[month] || 0) + 1;
          dailyCountMap[dayStr] = (dailyCountMap[dayStr] || 0) + 1;
        }
      }
    }
  }

  // Monthly timeline sorted
  const monthlyTimeline = Object.entries(monthlyMap)
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Yearly timeline sorted
  const yearlyTimeline = Object.entries(yearlyMap)
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year.localeCompare(b.year));

  // Top Emojis
  const topEmojis = Object.entries(emojiMap)
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Top Words
  const topWords = Object.entries(wordMap)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Daily streaks & most active day
  const dailyDates = Object.keys(dailyCountMap).sort();
  let mostActiveDay = { date: '', count: 0 };
  let longestStreak = 0;
  let currentStreak = 0;
  let prevDate = null;

  for (const dStr of dailyDates) {
    const count = dailyCountMap[dStr];
    if (count > mostActiveDay.count) {
      mostActiveDay = { date: dStr, count };
    }

    const cur = new Date(dStr);
    if (prevDate) {
      const diffDays = Math.round((cur - prevDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentStreak++;
      } else {
        longestStreak = Math.max(longestStreak, currentStreak);
        currentStreak = 1;
      }
    } else {
      currentStreak = 1;
    }
    prevDate = cur;
  }
  longestStreak = Math.max(longestStreak, currentStreak);

  res.json({
    totalMessages,
    totalCharacters,
    totalWords,
    avgMessageLength: totalMessages ? Math.round(totalCharacters / totalMessages) : 0,
    heatmap,
    monthlyTimeline,
    yearlyTimeline,
    topEmojis,
    topWords,
    attachmentStats,
    activityStreaks: {
      activeDays: dailyDates.length,
      longestStreak,
      mostActiveDay
    }
  });
});

// Channel History Exporter (HTML / CSV / JSON / TXT)
app.get('/api/channel/:id/export', (req, res) => {
  const channelId = req.params.id;
  const format = (req.query.format || 'html').toLowerCase();
  const channel = dataCache.channels.find(c => String(c.id) === String(channelId));
  const messages = dataCache.messages[channelId] || [];

  const cleanChName = channel ? cleanUsername(channel.name) : `Channel_${channelId}`;
  const safeFilename = cleanChName.replace(/[^a-zA-Z0-9_-]/g, '_');

  if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}_export.json"`);
    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify(messages, null, 2));
  }

  if (format === 'csv') {
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}_export.csv"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    let csv = 'ID,Timestamp,AuthorID,Contents,Attachments\r\n';
    for (const m of messages) {
      const id = (m.ID || '').replace(/"/g, '""');
      const time = (m.Timestamp || '').replace(/"/g, '""');
      const author = (m.AuthorID || '').replace(/"/g, '""');
      const contents = (m.Contents || '').replace(/"/g, '""');
      const atts = (m.Attachments || '').replace(/"/g, '""');
      csv += `"${id}","${time}","${author}","${contents}","${atts}"\r\n`;
    }
    return res.send(csv);
  }

  if (format === 'txt') {
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}_export.txt"`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    let txt = `=====================================================\r\n`;
    txt += `Discord Chat Export: ${cleanChName}\r\n`;
    txt += `Channel ID: ${channelId}\r\n`;
    txt += `Total Messages: ${messages.length}\r\n`;
    txt += `Exported: ${new Date().toISOString()}\r\n`;
    txt += `=====================================================\r\n\r\n`;
    for (const m of messages) {
      const time = m.Timestamp ? `[${m.Timestamp}] ` : '';
      txt += `${time}${m.Contents || ''}`;
      if (m.Attachments) txt += ` [Attachments: ${m.Attachments}]`;
      txt += '\r\n';
    }
    return res.send(txt);
  }

  // Default: Self-contained Offline HTML Document with Discord Styling
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}_export.html"`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(cleanChName)} - Discord Chat Export</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #313338; color: #dbdee1; margin: 0; padding: 20px; line-height: 1.4; }
    .header { background: #1e1f22; padding: 16px 24px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.08); }
    .header h1 { margin: 0 0 4px 0; color: #f2f3f5; font-size: 1.3rem; }
    .header p { margin: 0; font-size: 0.85rem; color: #949ba4; }
    .message-feed { display: flex; flex-direction: column; gap: 14px; max-width: 900px; margin: 0 auto; }
    .message-item { display: flex; gap: 14px; padding: 6px 12px; border-radius: 6px; }
    .message-item:hover { background: rgba(255,255,255,0.04); }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: #5865f2; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; }
    .content { flex: 1; overflow: hidden; }
    .author-time { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
    .author { font-weight: 600; color: #f2f3f5; font-size: 0.95rem; }
    .time { font-size: 0.72rem; color: #949ba4; }
    .text { font-size: 0.92rem; word-break: break-word; }
    .attachments { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
    .att-link { color: #5865f2; text-decoration: none; font-size: 0.85rem; }
    .att-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <h1>💬 ${escapeHtml(cleanChName)}</h1>
    <p>Channel ID: ${escapeHtml(channelId)} • Total Messages: ${messages.length} • Exported on ${new Date().toLocaleDateString()}</p>
  </div>
  <div class="message-feed">
`;

  for (const m of messages) {
    const formattedTime = m.Timestamp ? new Date(m.Timestamp).toLocaleString() : '';
    htmlContent += `
    <div class="message-item">
      <div class="avatar">💬</div>
      <div class="content">
        <div class="author-time">
          <span class="author">User</span>
          <span class="time">${escapeHtml(formattedTime)}</span>
        </div>
        <div class="text">${escapeHtml(m.Contents || '')}</div>
        ${m.Attachments ? `<div class="attachments"><a href="${escapeHtml(m.Attachments)}" target="_blank" class="att-link">📎 ${escapeHtml(m.Attachments)}</a></div>` : ''}
      </div>
    </div>`;
  }

  htmlContent += `
  </div>
</body>
</html>`;

  res.send(htmlContent);
});

// Set Package Path dynamically
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (packageDir) {
  indexPackage(packageDir);
}

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Discord Data Export Explorer v1.3.0 Running!`);
  console.log(`👉 Access Web UI: http://localhost:${PORT}`);
  if (packageDir) console.log(`📂 Package Directory: ${packageDir}`);
  console.log(`==================================================\n`);
});
