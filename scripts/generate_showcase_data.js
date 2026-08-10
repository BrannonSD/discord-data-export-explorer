/**
 * Synthetic Showcase Data Generator for Discord Data Export Explorer
 */
const fs = require('fs');
const path = require('path');

const SHOWCASE_DIR = path.resolve(__dirname, '..', 'dummy_showcase_package');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function generateShowcasePackage() {
  console.log(`Generating rich synthetic Discord export package at: ${SHOWCASE_DIR}...`);

  // 1. Account Info
  const accountData = {
    id: "392810482019482019",
    username: "AlexDev#0000",
    global_name: "Alex Dev",
    email: "alex.developer@example.com",
    phone: "+1 (555) 382-9102",
    accent_color: 5793266,
    premium_type: 2,
    created_at: "2017-09-12T14:32:00.000Z",
    bio: "Full-stack Software Engineer & Open Source Creator 🚀\nBuilding high-performance desktop apps & Discord data tools.",
    connected_accounts: [
      { type: "github", id: "alexdev", name: "alexdev", verified: true },
      { type: "spotify", id: "spotify_alex", name: "Alex Beats", verified: true },
      { type: "steam", id: "76561198000000001", name: "AlexGamer", verified: true },
      { type: "twitch", id: "alex_live", name: "AlexLive", verified: true },
      { type: "youtube", id: "UC1234567890", name: "Tech with Alex", verified: true },
      { type: "playstation", id: "AlexPSN", name: "AlexPSN", verified: true }
    ],
    relationships: [
      { id: "492810482019482020", type: 1, user: { username: "SarahConnor", global_name: "Sarah 🌸" } },
      { id: "592810482019482021", type: 1, user: { username: "CyberSamurai", global_name: "Kenji" } },
      { id: "692810482019482022", type: 1, user: { username: "RetroGamer", global_name: "Dave" } },
      { id: "792810482019482023", type: 1, user: { username: "ElenaCode", global_name: "Elena ✨" } }
    ]
  };
  writeJson(path.join(SHOWCASE_DIR, 'Account', 'user.json'), accountData);

  // 2. Servers Index
  const serversData = {
    "901000000000000001": "Dev & Open Source Hub",
    "901000000000000002": "Retro & Indie Gaming Lounge",
    "901000000000000003": "Tech Enthusiasts & Hardware",
    "901000000000000004": "Synthwave & Lo-Fi Music Room",
    "901000000000000005": "Designers & UI Creatives"
  };
  writeJson(path.join(SHOWCASE_DIR, 'Servers', 'index.json'), serversData);

  // 3. Messages Index
  const messagesIndex = {
    "101000000000000001": "announcements",
    "101000000000000002": "general-chat",
    "101000000000000003": "code-showcase",
    "101000000000000004": "retro-gaming",
    "102000000000000001": "Direct Message with Sarah 🌸#0000",
    "102000000000000002": "Direct Message with Kenji#0000",
    "102000000000000003": "Direct Message with Dave#0000",
    "102000000000000004": "Direct Message with Elena ✨#0000",
    "102000000000000005": "Direct Message with Deleted User#0000"
  };
  writeJson(path.join(SHOWCASE_DIR, 'Messages', 'index.json'), messagesIndex);

  // 4. Channels & Messages

  // Channel 1: Announcements (Server)
  writeJson(path.join(SHOWCASE_DIR, 'Messages', 'c101000000000000001', 'channel.json'), {
    id: "101000000000000001",
    type: "GUILD_TEXT",
    name: "announcements",
    guild: { id: "901000000000000001", name: "Dev & Open Source Hub" }
  });

  const annMsgs = [
    {
      ID: "810000000000000001",
      Timestamp: "2024-01-10T15:00:00.000Z",
      Contents: "# Welcome to Dev & Open Source Hub! 🚀\n-# Read our guidelines in <#101000000000000002> before posting.\n> Connect, collaborate, and build amazing open-source projects together.\nNext team sync: <t:1700000000:F> (<t:1700000000:R>) with <@492810482019482020> and <@&998877665544332211>",
      Attachments: ""
    },
    {
      ID: "810000000000000002",
      Timestamp: "2024-04-18T18:30:00.000Z",
      Contents: "🎉 **Major Release Announcement**: Version 1.3.0 is live! Includes 24/7 Activity Heatmaps, Media Lightbox Gallery, and offline HTML export: https://github.com/BrannonSD/discord-data-export-explorer <:pepedance:748920192837482910> <a:partyblob:849201827364519203>",
      Attachments: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80"
    }
  ];
  writeJson(path.join(SHOWCASE_DIR, 'Messages', 'c101000000000000001', 'messages.json'), annMsgs);

  // Channel 2: General Chat (Server) - Visually rich showcase
  writeJson(path.join(SHOWCASE_DIR, 'Messages', 'c101000000000000002', 'channel.json'), {
    id: "101000000000000002",
    type: "GUILD_TEXT",
    name: "general-chat",
    guild: { id: "901000000000000001", name: "Dev & Open Source Hub" }
  });

  const genMsgs = [
    {
      ID: "810000000000000010",
      Timestamp: "2024-02-14T11:20:00.000Z",
      Contents: "Good morning team! Check out the new performance benchmarks on the RFC 4180 CSV parser engine <:catjam:859302194820192038> <:pepedance:748920192837482910>",
      Attachments: ""
    },
    {
      ID: "810000000000000011",
      Timestamp: "2024-02-14T11:25:00.000Z",
      Contents: "Here is the exact streaming benchmark snippet:\n```javascript\nconst start = performance.now();\nconst parsed = parseDiscordCsv(rawCsvData);\nconsole.log(`Parsed ${parsed.length} messages in ${(performance.now() - start).toFixed(2)}ms`);\n```",
      Attachments: ""
    },
    {
      ID: "810000000000000012",
      Timestamp: "2024-02-14T11:32:00.000Z",
      Contents: "Don't reveal if you haven't seen the keynote yet: ||The new desktop app compiles into a zero-dependency single binary!||",
      Attachments: ""
    },
    {
      ID: "810000000000000013",
      Timestamp: "2024-02-14T11:40:00.000Z",
      Contents: "Best soundtrack for coding marathons 🎧\nhttps://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
      Attachments: ""
    },
    {
      ID: "810000000000000014",
      Timestamp: "2024-02-14T11:55:00.000Z",
      Contents: "Check out the new design system architecture diagram for our UI components:",
      Attachments: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&auto=format&fit=crop&q=80"
    },
    {
      ID: "810000000000000015",
      Timestamp: "2024-02-14T12:10:00.000Z",
      Contents: "Testing the video preview player and YouTube iframe integration:\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ",
      Attachments: ""
    }
  ];
  writeJson(path.join(SHOWCASE_DIR, 'Messages', 'c101000000000000002', 'messages.json'), genMsgs);

  // Channel 3: DM with Sarah (DM) - 250 diverse messages for realistic analytics
  writeJson(path.join(SHOWCASE_DIR, 'Messages', 'c102000000000000001', 'channel.json'), {
    id: "102000000000000001",
    type: "DM",
    name: "Sarah 🌸",
    recipients: ["392810482019482019", "492810482019482020"]
  });

  const sarahMsgs = [
    {
      ID: "820000000000000001",
      Timestamp: "2024-01-05T09:12:00.000Z",
      Contents: "Hey Alex! Ready for the v1.3.0 release roadmap review? 🌸",
      Attachments: ""
    },
    {
      ID: "820000000000000002",
      Timestamp: "2024-01-05T09:15:00.000Z",
      Contents: "Hey Sarah! Absolutely, I just finalized the interactive 24/7 Activity Heatmap and multi-theme customization system.",
      Attachments: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop&q=80"
    },
    {
      ID: "820000000000000003",
      Timestamp: "2024-01-05T09:20:00.000Z",
      Contents: "That dark theme styling with blurple accent `#5865F2` looks so premium! <:catjam:859302194820192038> <:pepedance:748920192837482910>",
      Attachments: ""
    },
    {
      ID: "820000000000000004",
      Timestamp: "2024-01-05T09:30:00.000Z",
      Contents: "Here is the Lo-Fi playlist we should embed: https://open.spotify.com/playlist/37i9dQZF1DXdLEN7aqioXM",
      Attachments: ""
    },
    {
      ID: "820000000000000005",
      Timestamp: "2024-01-05T09:45:00.000Z",
      Contents: "Don't forget: ||We are launching the standalone executable build today!||",
      Attachments: ""
    },
    {
      ID: "820000000000000006",
      Timestamp: "2024-01-05T10:00:00.000Z",
      Contents: "Meeting scheduled for <t:1700000000:F> (<t:1700000000:R>). See you in voice chat!",
      Attachments: ""
    }
  ];

  const phrases = [
    "Just checked the global cross-chat search filter with `has:image` and `from:me` — works instantly!",
    "The 24/7 activity heatmap matrix makes discovering peak chatting habits super interesting.",
    "Exporting entire channel history to standalone styled offline HTML is such a clean feature.",
    "Loving the new Midnight AMOLED and Cyberpunk neon themes! 🌌",
    "Verified all 29 automated tests in the test suite — 100% green pass rate.",
    "Playing some Counter-Strike 2 tonight with the team if you're free! 🎮",
    "Starred a few important messages into the Bookmarks Hub for quick reference.",
    "The RFC 4180 CSV parser handles multiline quotes with zero lag."
  ];

  for (let i = 7; i <= 240; i++) {
    const year = 2023 + (i % 4);
    const month = (i % 12) + 1;
    const day = (i % 27) + 1;
    const hour = (i * 5 + 3) % 24;
    const minute = (i * 13) % 60;
    const ts = new Date(Date.UTC(year, month - 1, day, hour, minute)).toISOString();
    sarahMsgs.push({
      ID: `8200000000000000${String(i).padStart(2, '0')}`,
      Timestamp: ts,
      Contents: phrases[i % phrases.length],
      Attachments: (i % 20 === 0) ? `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80` : ""
    });
  }

  sarahMsgs.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
  writeJson(path.join(SHOWCASE_DIR, 'Messages', 'c102000000000000001', 'messages.json'), sarahMsgs);

  // Channel 4: DM with Kenji (DM) - 100 messages
  writeJson(path.join(SHOWCASE_DIR, 'Messages', 'c102000000000000002', 'channel.json'), {
    id: "102000000000000002",
    type: "DM",
    name: "Kenji",
    recipients: ["392810482019482019", "592810482019482021"]
  });
  const kenjiMsgs = [];
  for (let i = 1; i <= 100; i++) {
    const year = 2024 + (i % 3);
    const month = (i % 12) + 1;
    const day = (i % 27) + 1;
    const hour = (i * 3 + 8) % 24;
    const ts = new Date(Date.UTC(year, month - 1, day, hour, (i * 17) % 60)).toISOString();
    kenjiMsgs.push({
      ID: `8300000000000000${String(i).padStart(2, '0')}`,
      Timestamp: ts,
      Contents: `Gaming session #${i}: Cyberpunk 2077 & VALORANT matches <:pepedance:748920192837482910>`,
      Attachments: ""
    });
  }
  kenjiMsgs.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
  writeJson(path.join(SHOWCASE_DIR, 'Messages', 'c102000000000000002', 'messages.json'), kenjiMsgs);

  // Channel 5: Deleted User DM
  writeJson(path.join(SHOWCASE_DIR, 'Messages', 'c102000000000000005', 'channel.json'), {
    id: "102000000000000005",
    type: "DM",
    recipients: ["392810482019482019", "Deleted User"]
  });
  const delMsgs = [
    { ID: "850000000000000001", Timestamp: "2023-08-01T12:00:00.000Z", Contents: "Hey <@892819283746192837>, check out this archived project repository!", Attachments: "" }
  ];
  writeJson(path.join(SHOWCASE_DIR, 'Messages', 'c102000000000000005', 'messages.json'), delMsgs);

  // 5. Activity Logs
  const activityData = [
    { event_type: "channel_opened", channel_id: "102000000000000005", recipient_ids: ["392810482019482019", "892819283746192837"], timestamp: "2023-08-01T12:00:00.000Z" },
    { event_type: "game_played", game_name: "Counter-Strike 2", duration_minutes: 380, timestamp: "2024-01-15T20:00:00.000Z" },
    { event_type: "game_played", game_name: "Cyberpunk 2077", duration_minutes: 520, timestamp: "2024-02-10T18:00:00.000Z" },
    { event_type: "game_played", game_name: "VALORANT", duration_minutes: 290, timestamp: "2024-03-05T21:00:00.000Z" },
    { event_type: "game_played", game_name: "Elden Ring", duration_minutes: 640, timestamp: "2024-04-12T19:00:00.000Z" },
    { event_type: "voice_channel_joined", guild_id: "901000000000000001", channel_id: "101000000000000001", duration_minutes: 180, timestamp: "2024-05-01T20:00:00.000Z" }
  ];
  const activityFile = path.join(SHOWCASE_DIR, 'Activity', 'analytics.json');
  ensureDir(path.dirname(activityFile));
  fs.writeFileSync(activityFile, activityData.map(d => JSON.stringify(d)).join('\n'), 'utf8');

  console.log(`✅ Rich synthetic showcase package successfully created at: ${SHOWCASE_DIR}`);
}

generateShowcasePackage();
