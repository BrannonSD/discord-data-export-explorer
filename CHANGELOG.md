# 📋 Changelog

All notable changes to the **Discord Data Export Explorer** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.0] - 2026-08-10

### 🚀 Major Feature Additions
- **Multi-Format Discord Export Parser (JSON + CSV)**:
  - Full native RFC 4180 CSV parsing engine in both Node.js (`server.js`) and standalone Python (`gui_launcher.py`).
  - Seamless support for Discord data export packages with `messages.csv` alongside standard `messages.json`.
  - Handles multiline message contents, quotes, commas, escaped characters, and ISO timestamp normalization.
- **Full-Fidelity Discord Markdown & Custom Emoji Engine**:
  - High-res rendering of custom animated (`<a:name:id>`) and static (`<:name:id>`) Discord emojis from Discord CDN with fallbacks.
  - Interactive click-to-reveal spoilers (`||secret text||`) with smooth blur effects.
  - Formatted relative and absolute Discord timestamps (`<t:1700000000:R>`).
  - Clickable channel mentions (`<#id>`) with direct in-app jump navigation.
  - User mentions (`<@id>`), role mentions (`<@&id>`), subtext (`-# text`), blockquotes, headers, and syntax-highlighted codeblocks with one-click copy buttons.
- **Media Lightbox & Gallery Viewer**:
  - Fullscreen interactive lightbox for images and videos with zoom, pan, rotate, download, copy URL, and gallery carousel (`◀` / `▶`) navigation across the entire channel.
  - Responsive inline embeds for **YouTube** and **Spotify** (tracks, albums, playlists).
- **Interactive Analytics & Statistics Studio (`/api/stats/advanced`)**:
  - **24/7 Activity Heatmap**: Interactive SVG matrix mapping sent messages by hour of day and day of week.
  - **Monthly & Yearly Volume Timeline**: Visual bar chart tracking chatting activity over time.
  - **Top Contacts & Servers**: Activity rankings with message volume distribution.
  - **Vocabulary & Emoji Clouds**: Frequency breakdown of most used words and custom emojis.
  - **Bulk Contact ID Exporter**: One-click bulk copy of all DM contact IDs and mention tags.
- **Multi-Format Offline Exporter**:
  - Export entire chat histories to **Standalone Styled HTML** (fully styled Discord dark mode, viewable and shareable offline), **CSV**, **JSON**, and **Plain Text (TXT)**.
- **Starred & Bookmarked Messages Hub**:
  - Star favorite messages with persistent `localStorage` storage and single-click jump back to any conversation.
  - Single-click export of all starred bookmarks to HTML.
- **Multi-Theme & Density Customization**:
  - 5 Themes: 🌙 **Dark (Default)**, 🖤 **Midnight (AMOLED)**, ☀️ **Light**, 🌌 **Cyberpunk**, and 🌸 **Sakura**.
  - **Cozy** vs **Compact** display density modes & font size slider (13px - 18px).
- **In-Chat Live Search & Date Jump**:
  - Live in-chat search with match count indicator (`Match 1 of 14`) and `▲` / `▼` smooth jump controls.
  - Calendar date picker for direct date navigation in any chat.
- **Keyboard Shortcuts**:
  - `Ctrl + K` / `Ctrl + F`: Global search.
  - `Ctrl + Shift + S`: Analytics Studio.
  - `Ctrl + Shift + B`: Starred Bookmarks Hub.
  - `Esc`: Close open modal / Lightbox / Clear search.

### 🧪 Automated Testing Suite
- Added 29 automated tests (100% passing):
  - 13 Node.js API integration tests (`tests/test_server.js`).
  - 8 Markdown and emoji parser unit tests (`tests/test_parser.js`).
  - 8 Python standalone backend parity tests (`tests/test_gui_launcher.py`).
- Synthetic mock Discord Data Package fixture (`tests/fixtures/mock_package/`).

### 📦 Build & Standalone Binary
- Recompiled standalone executable `DiscordDataExportExplorer.exe` (v1.3.0) with PyInstaller 6.21.0.

---

## [1.2.0] - 2026-06-15

### Added
- Chat sort order direction toggle (Oldest Top vs Oldest Bottom).
- Direct Discord native profile and chat launch shortcuts.
- Deleted User ID recovery engine from telemetry activity logs.
- Global search across all conversations.
- Basic stats modal.

---

## [1.0.0] - 2026-03-20

### Added
- Initial release of Discord Data Export Explorer with local HTTP server and web dashboard.
