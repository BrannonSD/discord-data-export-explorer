# 💬 Discord Data Export Explorer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v14%2B-green.svg)](https://nodejs.org/)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-brightgreen.svg)](#-privacy--security)
[![GitHub Repository](https://img.shields.io/badge/GitHub-BrannonSD%2Fdiscord--data--export--explorer-blue)](https://github.com/BrannonSD/discord-data-export-explorer)

> A lightweight, user-friendly desktop application and web explorer to easily browse, search, and navigate your unzipped **Discord Data Package** exports with a native Discord-styled UI, direct profile launch shortcuts, and user ID tag export tools.

---

## 📸 User Interface Preview

![Discord Data Export Explorer Preview](docs/preview.png)

---

## 🌟 Features

- **💬 Discord-Inspired Web UI**: Modern, dark glassmorphism interface styled after native Discord (`#1e1f22`, `#2b2d31`, `#5865F2`).
- **📁 Browse All Chats & Servers**: Categorized sidebar for **Direct Messages (DMs)**, **Group DMs**, and **Server Channels** with instant message count badges.
- **🚀 Native Discord Direct Chat & Profile Launcher**:
  - One-click **`Open Chat in Discord`** button (`discord://-/channels/@me/{channel_id}`) to jump directly into the exact DM chat room in native Discord!
  - **`Open Profile`** button (`discord://-/users/{user_id}`) to view recipient profile modal.
- **📋 User ID Export Tools**:
  - Copy `<@user_id>` mention tags (e.g. `<@879372420706881556>`) to paste into any Discord chat and mention/view users natively (works with Vencord repair).
  - Copy raw numeric User IDs or web profile links with one click.
- **🔍 Fast Search**: Instant in-conversation search and global message search across your entire history (100,000+ messages indexed in seconds).
- **📊 Analytics & Statistics**: Visual breakdown of total messages sent, top DM contacts, and most active servers.
- **🖥️ Standalone Desktop GUI Launcher**: Single-click `DiscordDataExportExplorer.exe` launcher with folder browser dialog to auto-start the server and open your web browser.
- **🔒 100% Private & Local**: Runs entirely on your local machine (`localhost`). Zero external servers, zero tracking, zero data collection.

---

## 🚀 Quick Start Guide

### Option 1: One-Click GUI Launcher (Windows Executable)

1. Download **`DiscordDataExportExplorer.exe`** from [Releases](https://github.com/BrannonSD/discord-data-export-explorer/releases).
2. Run **`DiscordDataExportExplorer.exe`**.
3. Click **`📁 Browse Folder...`** and select your unzipped Discord Data Package folder (containing `Account`, `Messages`, `Servers`).
4. Click **`🚀 Load Package & Open Browser`**. The web dashboard will automatically open in your default browser at `http://localhost:3000`.

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

## 🛠️ Built With

- **Backend**: Node.js / Python HTTP Server (Embedded)
- **Frontend**: Vanilla HTML5, CSS3 (Custom Discord Glassmorphism Design System), JavaScript (ES6+)
- **Desktop Launcher**: Embedded PyInstaller Single Executable (`DiscordDataExportExplorer.exe`), Python Tkinter (`gui_launcher.py`)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

Developed with ❤️ by [BrannonSD](https://github.com/BrannonSD).
