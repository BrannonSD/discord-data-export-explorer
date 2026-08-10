# 💬 Discord Data Export Explorer v1.3.0 Release Notes

A massive feature expansion, performance optimization, and quality upgrade for **Discord Data Export Explorer**.

---

## 🌟 What's New in v1.3.0

### 📁 Multi-Format Support (JSON + CSV)
- Full support for Discord data package exports containing `messages.csv` alongside `messages.json`.
- Built-in zero-dependency RFC 4180 CSV parser handling multiline messages, quotes, commas, and timestamp normalization across both Node.js and standalone Python backends.

### ✨ Full-Fidelity Discord Markdown & Custom Emojis
- High-res rendering of custom animated (`<a:name:id>`) and static (`<:name:id>`) Discord emojis.
- Interactive click-to-reveal spoilers (`||hidden spoiler||`).
- Formatted relative and absolute Discord timestamps (`<t:1700000000:R>`).
- Clickable channel mentions (`<#id>`), user mentions (`<@id>`), role mentions (`<@&id>`), subtext (`-# text`), blockquotes, headers, and codeblocks with one-click copy buttons.

### 🖼️ Rich Media Lightbox & Interactive Gallery
- Fullscreen zoomable/rotatable lightbox for image and video attachments.
- Gallery carousel (`◀` / `▶` navigation) across channel attachments with keyboard controls.
- Responsive inline embeds for **YouTube** and **Spotify** (tracks, albums, playlists).

### 📊 Interactive Analytics & Statistics Studio (`/api/stats/advanced`)
- **24/7 Activity Heatmap**: Interactive SVG matrix mapping sent messages by hour of day and day of week.
- **Monthly & Yearly Volume Timeline**: Visual bar chart tracking chatting activity over time.
- **Top Contacts & Servers**: Activity rankings with message volume distribution.
- **Vocabulary & Emoji Clouds**: Frequency breakdown of most used words and custom emojis.
- **Bulk DM User ID Exporter**: One-click bulk copy of all DM contact IDs and mention tags.

### 📦 Multi-Format Offline Exporter
- Standalone styled **HTML** export (shareable and viewable offline with Discord dark theme).
- Export to **CSV**, **JSON**, and **Plain Text (TXT)**.

### ⭐ Starred / Bookmarked Messages Hub
- Save favorite messages across conversations with persistent `localStorage` storage and single-click jump back to any conversation.
- Single-click export of all starred messages to HTML.

### 🎨 Multi-Theme & Density Customization
- 5 Themes: **Dark (Default)**, **Midnight (AMOLED)**, **Light**, **Cyberpunk**, and **Sakura**.
- **Cozy** vs **Compact** message density modes and font size adjustment slider (13px - 18px).

### 🔍 In-Chat Search & Date Navigation
- Live in-chat search with match count indicator (`Match 1 of 14`) and `▲` / `▼` smooth jump controls.
- Calendar date picker for direct date navigation in any chat.

### 🧪 Automated Testing Suite
- 29 automated unit and integration tests covering all endpoints, parsers, and recovery engines with 100% pass rate.

---

## 📥 Downloads
- **Standalone Windows Executable**: [`DiscordDataExportExplorer.exe`](DiscordDataExportExplorer.exe) (No Node.js or Python installation required).
