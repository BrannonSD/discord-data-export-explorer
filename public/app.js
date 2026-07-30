document.addEventListener('DOMContentLoaded', () => {
  // State
  let accountData = null;
  let allChannels = [];
  let activeChannel = null;
  let currentTab = 'all';
  let filterQuery = '';
  let activeOffset = 0;
  const LIMIT = 100;

  // DOM Elements
  const channelListEl = document.getElementById('channel-list');
  const messageFeedEl = document.getElementById('message-feed');
  const chatHeaderEl = document.getElementById('chat-header');
  const chatTitleEl = document.getElementById('chat-title');
  const chatSubtitleEl = document.getElementById('chat-subtitle');
  const chatIconEl = document.getElementById('chat-icon');
  
  const userExportToolbar = document.getElementById('user-export-toolbar');
  const badgeIdLabel = document.getElementById('badge-id-label');
  const exportUserIdText = document.getElementById('export-user-id-text');
  const btnLaunchChat = document.getElementById('btn-launch-chat');
  const btnLaunchProfile = document.getElementById('btn-launch-profile');
  const btnCopyTag = document.getElementById('btn-copy-tag');
  const btnCopyRawId = document.getElementById('btn-copy-raw-id');

  const channelFilterInput = document.getElementById('channel-filter-input');
  const chatSearchInput = document.getElementById('chat-search-input');
  const globalSearchInput = document.getElementById('global-search-input');
  
  const feedFooter = document.getElementById('feed-footer');
  const btnLoadMore = document.getElementById('btn-load-more');
  const feedStatusText = document.getElementById('feed-status-text');

  const toastEl = document.getElementById('toast');
  const userAvatarEl = document.getElementById('user-avatar');
  const userNameEl = document.getElementById('user-name');

  const btnStats = document.getElementById('btn-stats');
  const modalStats = document.getElementById('modal-stats');
  const modalStatsClose = document.getElementById('modal-stats-close');
  const modalStatsBody = document.getElementById('modal-stats-body');

  const modalSearch = document.getElementById('modal-search');
  const modalSearchClose = document.getElementById('modal-search-close');
  const modalSearchBody = document.getElementById('modal-search-body');

  const btnChangeFolder = document.getElementById('btn-change-folder');
  const folderBtnText = document.getElementById('folder-btn-text');
  const modalFolder = document.getElementById('modal-folder');
  const modalFolderClose = document.getElementById('modal-folder-close');
  const packagePathInput = document.getElementById('package-path-input');
  const btnSubmitPackagePath = document.getElementById('btn-submit-package-path');
  const folderStatusMessage = document.getElementById('folder-status-message');

  // Initialize
  init();

  async function init() {
    setupEventListeners();
    await checkStatus();
    await fetchAccountInfo();
    await fetchChannels();
  }

  function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        renderChannelList();
      });
    });

    // Channel filter input
    channelFilterInput.addEventListener('input', (e) => {
      filterQuery = e.target.value.trim().toLowerCase();
      renderChannelList();
    });

    // Chat search input
    chatSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && activeChannel) {
        loadMessages(activeChannel.id, e.target.value.trim(), true);
      }
    });

    // Global search input
    globalSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) {
          performGlobalSearch(query);
        }
      }
    });

    // Load more messages
    btnLoadMore.addEventListener('click', () => {
      if (activeChannel) {
        activeOffset += LIMIT;
        loadMessages(activeChannel.id, chatSearchInput.value.trim(), false);
      }
    });

    // Launch Chat Room in Discord
    btnLaunchChat.addEventListener('click', (e) => {
      e.preventDefault();
      if (!activeChannel) return;

      let appUri = '';
      let webUri = '';

      if (activeChannel.type === 'DM' || activeChannel.type === 'GROUP_DM') {
        appUri = `discord://-/channels/@me/${activeChannel.id}`;
        webUri = `https://discord.com/channels/@me/${activeChannel.id}`;
      } else if (activeChannel.guildId) {
        appUri = `discord://-/channels/${activeChannel.guildId}/${activeChannel.id}`;
        webUri = `https://discord.com/channels/${activeChannel.guildId}/${activeChannel.id}`;
      }

      if (appUri) {
        window.location.href = appUri;
        setTimeout(() => {
          window.open(webUri, '_blank');
        }, 350);
        showToast(`Opening chat in Discord...`);
      }
    });

    // Launch User Profile Modal in Discord
    btnLaunchProfile.addEventListener('click', (e) => {
      e.preventDefault();
      if (!activeChannel?.recipientId) return;

      const recipientId = activeChannel.recipientId;
      const appUri = `discord://-/users/${recipientId}`;
      const webUri = `https://discord.com/users/${recipientId}`;

      window.location.href = appUri;
      setTimeout(() => {
        window.open(webUri, '_blank');
      }, 350);

      showToast(`Opening user profile in Discord...`);
    });

    // Copy Mention Tag <@user_id>
    btnCopyTag.addEventListener('click', () => {
      if (activeChannel?.recipientId) {
        const tag = `<@${activeChannel.recipientId}>`;
        copyToClipboard(tag, `Copied mention tag ${tag}! (Paste into Discord chat)`);
      }
    });

    // Copy Raw ID
    btnCopyRawId.addEventListener('click', () => {
      const targetId = activeChannel?.recipientId || activeChannel?.id;
      if (targetId) {
        copyToClipboard(targetId, `Copied ID ${targetId}`);
      }
    });

    // Folder Selector Modal
    btnChangeFolder.addEventListener('click', () => {
      modalFolder.style.display = 'flex';
    });
    modalFolderClose.addEventListener('click', () => modalFolder.style.display = 'none');

    btnSubmitPackagePath.addEventListener('click', async () => {
      const newPath = packagePathInput.value.trim();
      if (!newPath) return;

      folderStatusMessage.textContent = 'Loading folder...';
      try {
        const res = await fetch('/api/set-package-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPath })
        });
        const data = await res.json();
        if (data.success) {
          folderStatusMessage.style.color = 'var(--status-green)';
          folderStatusMessage.textContent = `Successfully loaded ${data.totalChannels} chats from folder!`;
          setTimeout(() => {
            modalFolder.style.display = 'none';
            folderStatusMessage.textContent = '';
          }, 1000);
          await fetchAccountInfo();
          await fetchChannels();
        } else {
          folderStatusMessage.style.color = '#f23f43';
          folderStatusMessage.textContent = data.error || 'Failed to load folder.';
        }
      } catch (err) {
        folderStatusMessage.style.color = '#f23f43';
        folderStatusMessage.textContent = 'Network or server error.';
      }
    });

    // Modals
    btnStats.addEventListener('click', openStatsModal);
    modalStatsClose.addEventListener('click', () => modalStats.style.display = 'none');
    modalSearchClose.addEventListener('click', () => modalSearch.style.display = 'none');

    window.addEventListener('click', (e) => {
      if (e.target === modalStats) modalStats.style.display = 'none';
      if (e.target === modalSearch) modalSearch.style.display = 'none';
      if (e.target === modalFolder) modalFolder.style.display = 'none';
    });
  }

  // Check Status
  async function checkStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.packageDir) {
        const folderName = data.packageDir.split(/[/\\]/).pop();
        folderBtnText.textContent = folderName || 'Folder';
        packagePathInput.value = data.packageDir;
      }
      if (!data.isIndexed) {
        modalFolder.style.display = 'flex';
      }
    } catch (err) {
      console.error('Status check failed:', err);
    }
  }

  // Fetch Account Info
  async function fetchAccountInfo() {
    try {
      const res = await fetch('/api/account');
      accountData = await res.json();
      userNameEl.textContent = accountData.global_name || accountData.username || 'Discord User';
      userAvatarEl.textContent = (accountData.username || 'U').charAt(0).toUpperCase();
    } catch (err) {
      console.error('Failed to load account info:', err);
    }
  }

  // Fetch Channels List
  async function fetchChannels() {
    try {
      const res = await fetch('/api/channels');
      const data = await res.json();
      allChannels = data.channels || [];
      renderChannelList();

      if (allChannels.length > 0) {
        selectChannel(allChannels[0]);
      } else {
        channelListEl.innerHTML = `<div class="loading-state">No Discord export folder loaded yet. Click <strong>Folder</strong> above to select one.</div>`;
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
      channelListEl.innerHTML = `<div class="loading-state">Error loading channels. Check server connection.</div>`;
    }
  }

  // Render Sidebar Channels
  function renderChannelList() {
    let filtered = allChannels.filter(c => {
      if (currentTab === 'dm' && c.type !== 'DM') return false;
      if (currentTab === 'server' && c.type === 'DM') return false;

      if (filterQuery) {
        const nameMatch = (c.name || '').toLowerCase().includes(filterQuery);
        const guildMatch = (c.guildName || '').toLowerCase().includes(filterQuery);
        const handleMatch = (c.recipientHandle || '').toLowerCase().includes(filterQuery);
        const idMatch = (c.recipientId || '').includes(filterQuery);
        return nameMatch || guildMatch || handleMatch || idMatch;
      }
      return true;
    });

    if (filtered.length === 0) {
      channelListEl.innerHTML = `<div class="loading-state">No matching chats found.</div>`;
      return;
    }

    channelListEl.innerHTML = filtered.map(ch => {
      const isDm = ch.type === 'DM';
      const isActive = activeChannel && activeChannel.id === ch.id;
      const icon = isDm ? '👤' : (ch.type === 'GROUP_DM' ? '👥' : '#');
      const subtext = isDm 
        ? (ch.recipientHandle ? `@${ch.recipientHandle}` : `ID: ${ch.recipientId || ch.id}`) 
        : (ch.guildName || 'Server');

      return `
        <div class="channel-item ${isDm ? 'is-dm' : ''} ${isActive ? 'active' : ''}" data-id="${ch.id}">
          <div class="channel-info-group">
            <div class="channel-icon">${icon}</div>
            <div class="channel-details">
              <span class="channel-name">${escapeHtml(ch.name)}</span>
              <span class="channel-subtext">${escapeHtml(subtext)}</span>
            </div>
          </div>
          <span class="msg-badge">${ch.messageCount}</span>
        </div>
      `;
    }).join('');

    document.querySelectorAll('.channel-item').forEach(el => {
      el.addEventListener('click', () => {
        const chId = el.dataset.id;
        const channel = allChannels.find(c => String(c.id) === String(chId));
        if (channel) selectChannel(channel);
      });
    });
  }

  // Select Channel
  function selectChannel(channel) {
    activeChannel = channel;
    activeOffset = 0;
    renderChannelList();

    chatTitleEl.textContent = channel.name;
    chatIconEl.textContent = channel.type === 'DM' ? '👤' : (channel.type === 'GROUP_DM' ? '👥' : '#');
    userExportToolbar.style.display = 'flex';
    
    if (channel.type === 'DM') {
      chatSubtitleEl.textContent = `Direct Message History • ${channel.messageCount} messages`;
      badgeIdLabel.textContent = 'User ID:';
      exportUserIdText.textContent = channel.recipientId || channel.id;
      btnLaunchProfile.style.display = 'inline-flex';
      btnCopyTag.style.display = 'inline-flex';
    } else {
      chatSubtitleEl.textContent = `${channel.guildName ? channel.guildName + ' • ' : ''}${channel.messageCount} messages`;
      badgeIdLabel.textContent = 'Channel ID:';
      exportUserIdText.textContent = channel.id;
      btnLaunchProfile.style.display = 'none';
      btnCopyTag.style.display = 'none';
    }

    chatSearchInput.value = '';
    loadMessages(channel.id, '', true);
  }

  // Load Messages for Active Channel
  async function loadMessages(channelId, search = '', reset = true) {
    if (reset) {
      activeOffset = 0;
      messageFeedEl.innerHTML = `<div class="loading-state">Loading messages...</div>`;
    }

    try {
      const url = `/api/channel/${channelId}/messages?limit=${LIMIT}&offset=${activeOffset}&search=${encodeURIComponent(search)}`;
      const res = await fetch(url);
      const data = await res.json();

      const messages = data.messages || [];

      if (reset) {
        if (messages.length === 0) {
          messageFeedEl.innerHTML = `
            <div class="empty-state">
              <h3>No Messages Found</h3>
              <p>${search ? 'No messages match your search filter.' : 'This conversation has no recorded messages.'}</p>
            </div>
          `;
          feedFooter.style.display = 'none';
          return;
        }
        messageFeedEl.innerHTML = '';
      }

      const html = messages.map(msg => renderMessageCard(msg)).join('');
      
      if (reset) {
        messageFeedEl.innerHTML = html;
        messageFeedEl.scrollTop = messageFeedEl.scrollHeight;
      } else {
        const oldHeight = messageFeedEl.scrollHeight;
        messageFeedEl.insertAdjacentHTML('afterbegin', html);
        messageFeedEl.scrollTop = messageFeedEl.scrollHeight - oldHeight;
      }

      feedFooter.style.display = 'flex';
      feedStatusText.textContent = `Loaded ${Math.min(activeOffset + messages.length, data.totalMessages)} of ${data.totalMessages} messages`;
      btnLoadMore.style.display = (activeOffset + messages.length < data.totalMessages) ? 'inline-flex' : 'none';

    } catch (err) {
      console.error('Failed to load messages:', err);
      messageFeedEl.innerHTML = `<div class="loading-state">Error loading messages.</div>`;
    }
  }

  // Render Individual Message Card
  function renderMessageCard(msg) {
    const isMe = accountData && (String(msg.AuthorID) === String(accountData.id) || !msg.AuthorID);
    const authorName = isMe ? (accountData.global_name || accountData.username || 'You') : (activeChannel?.recipientHandle || 'User');
    const avatarLetter = authorName.charAt(0).toUpperCase();

    const formattedTime = msg.Timestamp 
      ? new Date(msg.Timestamp).toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true
        })
      : '';

    const formattedContent = parseMarkdown(msg.Contents || '');

    let attachmentsHtml = '';
    if (msg.Attachments) {
      const urls = msg.Attachments.split(/\s+/).filter(u => u.startsWith('http'));
      if (urls.length > 0) {
        attachmentsHtml = `
          <div class="msg-attachments">
            ${urls.map(url => `
              <a href="${escapeHtml(url)}" target="_blank" class="attachment-pill">
                📎 ${escapeHtml(url.split('/').pop().split('?')[0] || 'Attachment')}
              </a>
            `).join('')}
          </div>
        `;
      }
    }

    return `
      <div class="message-item">
        <div class="msg-avatar">${avatarLetter}</div>
        <div class="msg-content-wrapper">
          <div class="msg-header">
            <span class="msg-author">${escapeHtml(authorName)}</span>
            <span class="msg-timestamp">${formattedTime}</span>
          </div>
          <div class="msg-text">${formattedContent}</div>
          ${attachmentsHtml}
        </div>
      </div>
    `;
  }

  // Parse Markdown & Mentions
  function parseMarkdown(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);

    escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/&lt;@!?(\d+)&gt;/g, '<span class="user-id-badge">@$1</span>');

    return escaped;
  }

  // Global Search
  async function performGlobalSearch(query) {
    modalSearch.style.display = 'flex';
    modalSearchBody.innerHTML = `<div class="loading-state">Searching all conversations for "${escapeHtml(query)}"...</div>`;

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (data.results.length === 0) {
        modalSearchBody.innerHTML = `<div class="empty-state"><p>No messages found matching "${escapeHtml(query)}".</p></div>`;
        return;
      }

      modalSearchBody.innerHTML = `
        <p style="margin-bottom: 12px; color: var(--text-muted); font-size: 0.9rem;">Found ${data.total} matching messages:</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${data.results.map(r => `
            <div class="message-item" style="background: var(--bg-tertiary); cursor: pointer;" onclick="jumpToChannel('${r.channelId}')">
              <div class="msg-content-wrapper">
                <div class="msg-header">
                  <span class="msg-author">${escapeHtml(r.channelName)}</span>
                  <span class="msg-timestamp">${r.message.Timestamp || ''}</span>
                </div>
                <div class="msg-text">${parseMarkdown(r.message.Contents)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      console.error('Search failed:', err);
      modalSearchBody.innerHTML = `<div class="loading-state">Search failed.</div>`;
    }
  }

  window.jumpToChannel = function(channelId) {
    modalSearch.style.display = 'none';
    const channel = allChannels.find(c => String(c.id) === String(channelId));
    if (channel) selectChannel(channel);
  };

  // Open Stats Modal
  async function openStatsModal() {
    modalStats.style.display = 'flex';
    modalStatsBody.innerHTML = `<div class="loading-state">Calculating message statistics...</div>`;

    try {
      const res = await fetch('/api/stats');
      const stats = await res.json();

      modalStatsBody.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
          <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--brand-light);">${stats.totalMessages.toLocaleString()}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Total Messages</div>
          </div>
          <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--status-green);">${stats.dmCount}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Direct Message Chats</div>
          </div>
          <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-bold);">${stats.guildChannelCount}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Server Channels</div>
          </div>
        </div>

        <h4 style="color: var(--text-bold); margin-bottom: 8px;">Top Direct Message Contacts</h4>
        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px;">
          ${stats.topDms.map(d => `
            <div style="display: flex; justify-content: space-between; background: var(--bg-tertiary); padding: 8px 12px; border-radius: 6px; font-size: 0.9rem;">
              <span>👤 ${escapeHtml(d.name)} ${d.recipientId ? `<code style="font-size: 0.75rem; color: var(--brand-light);">(${d.recipientId})</code>` : ''}</span>
              <span style="font-weight: 600; color: var(--text-bold);">${d.messageCount} msgs</span>
            </div>
          `).join('')}
        </div>

        <h4 style="color: var(--text-bold); margin-bottom: 8px;">Top Active Servers</h4>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${stats.topGuilds.map(g => `
            <div style="display: flex; justify-content: space-between; background: var(--bg-tertiary); padding: 8px 12px; border-radius: 6px; font-size: 0.9rem;">
              <span>🏰 ${escapeHtml(g.name)}</span>
              <span style="font-weight: 600; color: var(--text-bold);">${g.count} msgs</span>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      console.error('Stats failed:', err);
      modalStatsBody.innerHTML = `<div class="loading-state">Failed to calculate statistics.</div>`;
    }
  }

  // Utilities
  function copyToClipboard(text, toastMsg) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(toastMsg || 'Copied to clipboard!');
    }).catch(err => {
      console.error('Copy error:', err);
      showToast('Failed to copy text.');
    });
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
