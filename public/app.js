document.addEventListener('DOMContentLoaded', () => {
  // State
  let accountData = null;
  let allChannels = [];
  let activeChannel = null;
  let currentTab = 'all';
  let filterQuery = '';
  let activeOffset = 0;
  let hasMoreMessages = true;
  let isLoadingMessages = false;
  let sortDirection = 'asc';
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
  const btnCopySearch = document.getElementById('btn-copy-search');
  const btnCopyRawId = document.getElementById('btn-copy-raw-id');
  
  const btnSortOrder = document.getElementById('btn-sort-order');
  const sortOrderIcon = document.getElementById('sort-order-icon');
  const sortOrderLabel = document.getElementById('sort-order-label');

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

  function cleanName(str) {
    if (!str) return '';
    let cleaned = String(str).trim();
    cleaned = cleaned.replace(/^Direct Message with\s+/i, '');
    cleaned = cleaned.replace(/#(0|0000)$/, '');
    return cleaned;
  }

  function getRecipientAvatarHtml(ch) {
    const isDm = ch.type === 'DM';
    if (!isDm) {
      return `<div class="channel-avatar-circle" style="background: rgba(255,255,255,0.05); font-size: 1.1rem;">${ch.type === 'GROUP_DM' ? '👥' : '#'}</div>`;
    }

    const name = cleanName(ch.name || ch.recipientHandle || 'User');
    const initial = name.charAt(0).toUpperCase();

    if (ch.isDeletedUser && (!ch.recipientId || ch.recipientId === 'Deleted User')) {
      return `<div class="channel-avatar-circle deleted-avatar" title="Deleted Account">💀</div>`;
    }

    let avatarUrl = '';
    if (ch.recipientId && ch.recipientId !== 'Deleted User') {
      try {
        const idx = Number(BigInt(ch.recipientId) % 6n);
        avatarUrl = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
      } catch (e) {
        avatarUrl = '';
      }
    }

    if (avatarUrl) {
      return `
        <div class="channel-avatar-circle">
          <img src="${avatarUrl}" alt="${escapeHtml(name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <span class="avatar-fallback" style="display: none;">${initial}</span>
        </div>
      `;
    }

    return `
      <div class="channel-avatar-circle">
        <span class="avatar-fallback">${initial}</span>
      </div>
    `;
  }

  function setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        renderChannelList();
      });
    });

    btnSortOrder.addEventListener('click', () => {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      if (sortDirection === 'asc') {
        sortOrderIcon.textContent = '⬇️';
        sortOrderLabel.textContent = 'Oldest Top';
        showToast('Message Order: Oldest at top (chronological)');
      } else {
        sortOrderIcon.textContent = '⬆️';
        sortOrderLabel.textContent = 'Oldest Bottom';
        showToast('Message Order: Oldest at bottom (reverse chronological)');
      }
      if (activeChannel) {
        loadMessages(activeChannel.id, chatSearchInput.value.trim(), true);
      }
    });

    channelFilterInput.addEventListener('input', (e) => {
      filterQuery = e.target.value.trim().toLowerCase();
      renderChannelList();
    });

    chatSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && activeChannel) {
        loadMessages(activeChannel.id, e.target.value.trim(), true);
      }
    });

    globalSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) {
          performGlobalSearch(query);
        }
      }
    });

    btnLoadMore.addEventListener('click', () => {
      if (activeChannel && hasMoreMessages && !isLoadingMessages) {
        activeOffset += LIMIT;
        loadMessages(activeChannel.id, chatSearchInput.value.trim(), false);
      }
    });

    messageFeedEl.addEventListener('scroll', () => {
      if (messageFeedEl.scrollTop < 80 && activeChannel && hasMoreMessages && !isLoadingMessages) {
        activeOffset += LIMIT;
        loadMessages(activeChannel.id, chatSearchInput.value.trim(), false);
      }
    });

    btnLaunchChat.addEventListener('click', (e) => {
      e.preventDefault();
      if (!activeChannel) return;

      if (activeChannel.isDeletedUser && (!activeChannel.recipientId || activeChannel.recipientId === 'Deleted User')) {
        showToast('Discord closes DMs server-side when an account is deleted. Full chat history is preserved in this local viewer.');
        return;
      }

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

    btnLaunchProfile.addEventListener('click', (e) => {
      e.preventDefault();
      if (!activeChannel?.recipientId || activeChannel.recipientId === 'Deleted User') {
        showToast('Account permanently deleted by Discord.');
        return;
      }

      const recipientId = activeChannel.recipientId;
      const appUri = `discord://-/users/${recipientId}`;
      const webUri = `https://discord.com/users/${recipientId}`;

      window.location.href = appUri;
      setTimeout(() => {
        window.open(webUri, '_blank');
      }, 350);

      showToast(`Opening user profile in Discord...`);
    });

    btnCopyTag.addEventListener('click', () => {
      if (activeChannel?.recipientId && activeChannel.recipientId !== 'Deleted User') {
        const tag = `<@${activeChannel.recipientId}>`;
        copyToClipboard(tag, `Copied mention tag ${tag}! (Paste into Discord chat)`);
      } else {
        showToast('No User ID available for this deleted account.');
      }
    });

    btnCopySearch.addEventListener('click', () => {
      const filterValue = activeChannel?.recipientId && activeChannel.recipientId !== 'Deleted User'
        ? `from:${activeChannel.recipientId}`
        : (activeChannel?.recipientHandle ? `from:${cleanName(activeChannel.recipientHandle)}` : `from:${activeChannel.id}`);
      
      copyToClipboard(filterValue, `Copied search filter "${filterValue}" (Paste into Discord Ctrl+F search)`);
    });

    btnCopyRawId.addEventListener('click', () => {
      const targetId = activeChannel?.recipientId || activeChannel?.id;
      if (targetId) {
        copyToClipboard(targetId, `Copied ID ${targetId}`);
      }
    });

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

    btnStats.addEventListener('click', openStatsModal);
    modalStatsClose.addEventListener('click', () => modalStats.style.display = 'none');
    modalSearchClose.addEventListener('click', () => modalSearch.style.display = 'none');

    window.addEventListener('click', (e) => {
      if (e.target === modalStats) modalStats.style.display = 'none';
      if (e.target === modalSearch) modalSearch.style.display = 'none';
      if (e.target === modalFolder) modalFolder.style.display = 'none';
    });
  }

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

  async function fetchAccountInfo() {
    try {
      const res = await fetch('/api/account');
      accountData = await res.json();
      const displayName = cleanName(accountData.global_name || accountData.username || 'Discord User');
      userNameEl.textContent = displayName;
      
      const avatarInitial = displayName.charAt(0).toUpperCase();
      userAvatarEl.innerHTML = `
        <img src="/api/account/avatar" alt="Avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <span class="avatar-fallback" style="display: none;">${avatarInitial}</span>
      `;
    } catch (err) {
      console.error('Failed to load account info:', err);
    }
  }

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

  function renderChannelList() {
    let filtered = allChannels.filter(c => {
      if (currentTab === 'dm' && c.type !== 'DM') return false;
      if (currentTab === 'server' && c.type === 'DM') return false;

      if (filterQuery) {
        const nameMatch = cleanName(c.name || '').toLowerCase().includes(filterQuery);
        const guildMatch = (c.guildName || '').toLowerCase().includes(filterQuery);
        const handleMatch = cleanName(c.recipientHandle || '').toLowerCase().includes(filterQuery);
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
      const avatarHtml = getRecipientAvatarHtml(ch);
      const cleanedChName = cleanName(ch.name);
      const cleanedHandle = cleanName(ch.recipientHandle);

      const subtext = isDm 
        ? (cleanedHandle ? `@${cleanedHandle}` : (ch.recipientId && ch.recipientId !== 'Deleted User' ? `ID: ${ch.recipientId}` : 'Deleted Account')) 
        : (ch.guildName || 'Server');

      return `
        <div class="channel-item ${isDm ? 'is-dm' : ''} ${isActive ? 'active' : ''}" data-id="${ch.id}">
          <div class="channel-info-group">
            ${avatarHtml}
            <div class="channel-details">
              <span class="channel-name">${escapeHtml(cleanedChName)}</span>
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

  function selectChannel(channel) {
    activeChannel = channel;
    activeOffset = 0;
    hasMoreMessages = true;
    renderChannelList();

    const cleanedName = cleanName(channel.name);
    chatTitleEl.textContent = cleanedName;
    chatIconEl.innerHTML = getRecipientAvatarHtml(channel);
    userExportToolbar.style.display = 'flex';
    
    if (channel.type === 'DM') {
      chatSubtitleEl.textContent = `Direct Message History • ${channel.messageCount} messages`;
      
      if (channel.recipientId && channel.recipientId !== 'Deleted User') {
        badgeIdLabel.textContent = channel.isRecovered ? 'User ID (Recovered):' : 'User ID:';
        exportUserIdText.textContent = channel.recipientId;
        btnLaunchProfile.style.opacity = '1';
        btnCopyTag.style.opacity = '1';
      } else {
        badgeIdLabel.textContent = 'User ID:';
        exportUserIdText.textContent = 'Unavailable (Deleted Account)';
        btnLaunchProfile.style.opacity = '0.5';
        btnCopyTag.style.opacity = '0.5';
      }
      
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

  async function loadMessages(channelId, search = '', reset = true) {
    if (isLoadingMessages) return;
    isLoadingMessages = true;

    if (reset) {
      activeOffset = 0;
      messageFeedEl.innerHTML = `<div class="loading-state">Loading messages...</div>`;
    }

    try {
      const url = `/api/channel/${channelId}/messages?limit=${LIMIT}&offset=${activeOffset}&search=${encodeURIComponent(search)}`;
      const res = await fetch(url);
      const data = await res.json();

      let messages = data.messages || [];
      hasMoreMessages = data.hasMore !== false && (activeOffset + messages.length < data.totalMessages);

      if (sortDirection === 'desc') {
        messages = [...messages].reverse();
      }

      if (reset) {
        if (messages.length === 0) {
          messageFeedEl.innerHTML = `
            <div class="empty-state">
              <h3>No Messages Found</h3>
              <p>${search ? 'No messages match your search filter.' : 'This conversation has no recorded messages.'}</p>
            </div>
          `;
          feedFooter.style.display = 'none';
          isLoadingMessages = false;
          return;
        }
        messageFeedEl.innerHTML = '';
      }

      const html = messages.map(msg => renderMessageCard(msg)).join('');
      
      if (reset) {
        messageFeedEl.innerHTML = html;
        messageFeedEl.scrollTop = sortDirection === 'asc' ? messageFeedEl.scrollHeight : 0;
      } else {
        const oldScrollHeight = messageFeedEl.scrollHeight;
        messageFeedEl.insertAdjacentHTML(sortDirection === 'asc' ? 'afterbegin' : 'beforeend', html);
        if (sortDirection === 'asc') {
          messageFeedEl.scrollTop = messageFeedEl.scrollHeight - oldScrollHeight;
        }
      }

      feedFooter.style.display = 'flex';
      feedStatusText.textContent = `Displaying ${Math.min(activeOffset + messages.length, data.totalMessages)} of ${data.totalMessages} messages`;
      btnLoadMore.style.display = hasMoreMessages ? 'inline-flex' : 'none';

    } catch (err) {
      console.error('Failed to load messages:', err);
      messageFeedEl.innerHTML = `<div class="loading-state">Error loading messages.</div>`;
    } finally {
      isLoadingMessages = false;
    }
  }

  function renderMessageCard(msg) {
    const isMe = accountData && (String(msg.AuthorID) === String(accountData.id) || !msg.AuthorID);
    const authorName = isMe ? cleanName(accountData.global_name || accountData.username || 'You') : cleanName(activeChannel?.recipientHandle || activeChannel?.name || 'User');
    const avatarLetter = authorName.charAt(0).toUpperCase();

    let avatarImgSrc = '';
    if (isMe) {
      avatarImgSrc = '/api/account/avatar';
    } else if (activeChannel?.recipientId && String(activeChannel.recipientId) !== 'Deleted User') {
      try {
        const idx = Number(BigInt(activeChannel.recipientId) % 6n);
        avatarImgSrc = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
      } catch (e) {
        avatarImgSrc = '';
      }
    }

    let avatarHtml = '';
    if (avatarImgSrc) {
      avatarHtml = `
        <div class="msg-avatar">
          <img src="${avatarImgSrc}" alt="${escapeHtml(authorName)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <span class="avatar-fallback" style="display: none;">${avatarLetter}</span>
        </div>
      `;
    } else {
      avatarHtml = `
        <div class="msg-avatar">
          <span class="avatar-fallback">${avatarLetter}</span>
        </div>
      `;
    }

    const formattedTime = msg.Timestamp 
      ? new Date(msg.Timestamp).toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true
        })
      : '';

    const formattedContent = parseMarkdown(msg.Contents || '');
    const mediaHtml = renderMessageMedia(msg.Contents || '', msg.Attachments || '');

    return `
      <div class="message-item">
        ${avatarHtml}
        <div class="msg-content-wrapper">
          <div class="msg-header">
            <span class="msg-author">${escapeHtml(authorName)}</span>
            <span class="msg-timestamp">${formattedTime}</span>
          </div>
          <div class="msg-text">${formattedContent}</div>
          ${mediaHtml}
        </div>
      </div>
    `;
  }

  function renderMessageMedia(contents, attachmentsString) {
    let html = '';

    if (attachmentsString) {
      const urls = attachmentsString.split(/\s+/).filter(u => u.trim().length > 0);
      if (urls.length > 0) {
        html += '<div class="msg-attachments">';
        urls.forEach(url => {
          const cleanUrl = url.trim();
          const filename = cleanUrl.split('/').pop().split('?')[0] || 'Attachment';
          const ext = filename.split('.').pop().toLowerCase();

          if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) {
            html += `
              <div class="msg-media-block">
                <img src="${escapeHtml(cleanUrl)}" alt="${escapeHtml(filename)}" class="msg-inline-img" onerror="this.style.display='none';" />
                <a href="${escapeHtml(cleanUrl)}" target="_blank" class="attachment-pill">📎 ${escapeHtml(filename)}</a>
              </div>
            `;
          } else if (['mp4', 'webm', 'mov'].includes(ext)) {
            html += `
              <div class="msg-media-block">
                <video controls class="msg-inline-video" src="${escapeHtml(cleanUrl)}"></video>
                <a href="${escapeHtml(cleanUrl)}" target="_blank" class="attachment-pill">🎬 ${escapeHtml(filename)}</a>
              </div>
            `;
          } else if (['mp3', 'ogg', 'wav'].includes(ext)) {
            html += `
              <div class="msg-media-block">
                <audio controls src="${escapeHtml(cleanUrl)}"></audio>
                <a href="${escapeHtml(cleanUrl)}" target="_blank" class="attachment-pill">🎵 ${escapeHtml(filename)}</a>
              </div>
            `;
          } else {
            html += `
              <div class="msg-media-block">
                <a href="${escapeHtml(cleanUrl)}" target="_blank" class="attachment-pill">📄 ${escapeHtml(filename)}</a>
              </div>
            `;
          }
        });
        html += '</div>';
      }
    }

    const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi;
    let ytMatch;
    const embeddedYt = new Set();
    while ((ytMatch = ytRegex.exec(contents)) !== null) {
      const videoId = ytMatch[1];
      if (!embeddedYt.has(videoId)) {
        embeddedYt.add(videoId);
        html += `
          <div class="msg-embed-container youtube-embed">
            <iframe src="https://www.youtube.com/embed/${videoId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
          </div>
        `;
      }
    }

    return html;
  }

  function parseMarkdown(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);

    escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/&lt;@!?(\d+)&gt;/g, '<span class="user-mention-pill">@$1</span>');

    return escaped;
  }

  async function performGlobalSearch(query) {
    modalSearch.style.display = 'flex';
    modalSearchBody.innerHTML = `<div class="loading-state">Searching all conversations for "${escapeHtml(query)}"...</div>`;

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=1000`);
      const data = await res.json();

      if (data.results.length === 0) {
        modalSearchBody.innerHTML = `<div class="empty-state"><p>No messages found matching "${escapeHtml(query)}".</p></div>`;
        return;
      }

      modalSearchBody.innerHTML = `
        <p style="margin-bottom: 12px; color: var(--text-muted); font-size: 0.9rem;">Found ${data.total} matching messages (displaying up to 1,000):</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${data.results.map(r => `
            <div class="message-item" style="background: var(--bg-tertiary); cursor: pointer;" onclick="jumpToChannel('${r.channelId}')">
              <div class="msg-content-wrapper">
                <div class="msg-header">
                  <span class="msg-author">${escapeHtml(cleanName(r.channelName))}</span>
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

  async function openStatsModal() {
    modalStats.style.display = 'flex';
    modalStatsBody.innerHTML = `<div class="loading-state">Calculating message statistics...</div>`;

    try {
      const res = await fetch('/api/stats');
      const stats = await res.json();

      modalStatsBody.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
          <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--brand-blurple);">${stats.totalMessages.toLocaleString()}</div>
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
              <span>👤 ${escapeHtml(cleanName(d.name))} ${d.recipientId && d.recipientId !== 'Deleted User' ? `<code style="font-size: 0.75rem; color: var(--brand-blurple);">(${d.recipientId})</code>` : ''}</span>
              <span style="font-weight: 600; color: var(--text-bold);">${d.messageCount} msgs</span>
            </div>
          `).join('')}
        </div>

        <h4 style="color: var(--text-bold); margin-bottom: 8px;">Top Active Servers</h4>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${stats.topGuilds.map(g => `
            <div style="display: flex; justify-content: space-between; background: var(--bg-tertiary); padding: 8px 12px; border-radius: 6px; font-size: 0.9rem;">
              <span>🏰 ${escapeHtml(cleanName(g.name))}</span>
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
