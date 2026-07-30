# 💬 Discord Data Export Explorer

[![Version: 1.2.0](https://img.shields.io/badge/Version-v1.2.0-5865F2.svg)](#-features)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v14%2B-green.svg)](https://nodejs.org/)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-brightgreen.svg)](#-privacy--security)

> A lightweight, user-friendly desktop application and web explorer to easily browse, search, and navigate your unzipped **Discord Data Package** exports with an authentic Discord-styled UI, direct profile launch shortcuts, user ID tag export tools, and full analytics.

---

## 📸 Interface Preview

### Main Chat Explorer View
![Discord Data Export Explorer Chat Interface](preview_chat.png)

### Export Analytics & Message Statistics
![Discord Data Export Explorer Analytics Modal](preview_stats.png)

---

## 🌟 Key Features

- **💬 Authentic Discord-Inspired UI**: Modern, dark glassmorphism interface styled matching native Discord (`#1e1f22`, `#2b2d31`, `#5865F2`).
- **⚡ Instant Startup & On-Demand Message Loading**: Instant package indexing (< 0.5s) with exact message count verification across 100,000+ messages.
- **⇅ Chat Sort Order Direction Toggle**: Easily switch message feeds between chronological (`⬇️ Oldest Top`) and reverse chronological (`⬆️ Oldest Bottom`) order.
- **🚀 Native Discord Direct Launch**:
  - One-click **`Open Chat in Discord`** button (`discord://-/channels/@me/{channel_id}`) to jump directly into the exact chat room natively in Discord.
  - **`Open Profile`** button (`discord://-/users/{user_id}`) to open recipient profile modals natively inside Discord.
- **📋 User ID & Search Filter Exporter**:
  - Copy `<@user_id>` mention tags (e.g. `<@392810482019482019>`) to paste into any Discord chat.
  - Copy `from:User_ID` search filters to paste into Discord's native search bar (`Ctrl + F`).
- **🖼️ Attachments & YouTube Video Embeds**: Display inline image, video, audio, and document attachments alongside responsive YouTube video embeds.
- **🔍 Global Cross-Chat Search**: Instant search across your entire export history (up to 1,000 matches) with click-to-jump navigation into any message.
- **📊 Analytics & Statistics Modal**: Detailed breakdown of total messages sent, top DM contacts, and most active server channels.
- **🛡️ Deleted User ID Log Recovery**: Automatic background recovery of deleted account IDs from activity and telemetry logs.
- **🖥️ Standalone Windows Desktop Launcher**: Single-click `DiscordDataExportExplorer.exe` launcher with folder selection dialog.
- **🔒 100% Private & Local**: Runs entirely on your local machine (`localhost`). Zero external servers, zero tracking, zero data collection.

---

## 🚀 Quick Start Guide

### Option 1: Standalone Windows Executable (GUI Launcher)

1. Download **`DiscordDataExportExplorer.exe`** from [Releases](https://github.com/BrannonSD/discord-data-export-explorer/releases).
2. Run **`DiscordDataExportExplorer.exe`**.
3. Click **`Browse...`** and select your unzipped Discord Data Package folder (containing `Account`, `Messages`, `Servers`).
4. Click **`🚀 Launch Explorer in Browser`**. The web dashboard will open in your browser at `http://localhost:3000`.

---

### Option 2: Command Line (Node.js)

1. Clone the repository:
   ```bash
   git clone https://github.com/BrannonSD/discord-data-export-explorer.git
   cd discord-data-export-explorer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch server with your export folder path:
   ```bash
   node server.js --package "C:/path/to/your/unzipped/package"
   ```

4. Open your browser to `http://localhost:3000`.

---

### Option 3: Python GUI Launcher (Cross-Platform)

Run the included Python GUI script (requires Python 3):
```bash
python gui_launcher.py
```

---

## 📥 How to Get Your Discord Data Package

1. In Discord, go to **User Settings** (⚙️ cog icon).
2. Navigate to **Privacy & Safety**.
3. Scroll down to **Request all of my data** and click **Request Data**.
4. Discord will email you a link to download your `.zip` data package (usually within 24-48 hours).
5. Extract the `.zip` archive to a folder on your computer and select that folder in **Discord Data Export Explorer**.

---

## 🔒 Privacy & Security

Your privacy is paramount. **Discord Data Export Explorer**:
- Runs 100% locally on your own computer (`localhost:3000`).
- Does **NOT** send any data to external servers or APIs.
- Does **NOT** track usage, analytics, or IP addresses.
- Your message data never leaves your disk.

---

## 🛠️ Tech Stack

- **Backend**: Node.js / Python HTTP Server (Embedded)
- **Frontend**: Vanilla HTML5, CSS3 (Custom Discord Glassmorphism Design System), JavaScript (ES6+)
- **Desktop Launcher**: Single Executable (`DiscordDataExportExplorer.exe`) compiled with PyInstaller & Python Tkinter (`gui_launcher.py`)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

Developed with ❤️ by [BrannonSD](https://github.com/BrannonSD).
