document.addEventListener('DOMContentLoaded', () => {
  // Global State
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

  // Search in chat state
  let chatSearchResults = [];
  let currentMatchIndex = 0;

  // Lightbox state
  let galleryImages = [];
  let currentLightboxIndex = 0;
  let lightboxZoom = 1;
  let lightboxRotation = 0;

  // Bookmarks (Starred Messages) in LocalStorage
  let bookmarks = JSON.parse(localStorage.getItem('discord_export_bookmarks') || '[]');

  // DOM Elements
  const appEl = document.getElementById('app');
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
  const btnClearFilter = document.getElementById('btn-clear-filter');
  
  const chatSearchInput = document.getElementById('chat-search-input');
  const btnClearChatSearch = document.getElementById('btn-clear-chat-search');
  const searchMatchControls = document.getElementById('search-match-controls');
  const searchMatchCounter = document.getElementById('search-match-counter');
  const btnSearchPrev = document.getElementById('btn-search-prev');
  const btnSearchNext = document.getElementById('btn-search-next');
  
  const globalSearchInput = document.getElementById('global-search-input');
  
  // Date Jump
  const btnJumpDateToggle = document.getElementById('btn-jump-date-toggle');
  const dateJumpPopover = document.getElementById('date-jump-popover');
  const dateJumpInput = document.getElementById('date-jump-input');
  const btnJumpOldest = document.getElementById('btn-jump-oldest');
  const btnJumpNewest = document.getElementById('btn-jump-newest');

  // Export Menu
  const btnExportMenuToggle = document.getElementById('btn-export-menu-toggle');
  const exportDropdownMenu = document.getElementById('export-dropdown-menu');
  const exportActionHtml = document.getElementById('export-action-html');
  const exportActionCsv = document.getElementById('export-action-csv');
  const exportActionJson = document.getElementById('export-action-json');
  const exportActionTxt = document.getElementById('export-action-txt');

  const feedFooter = document.getElementById('feed-footer');
  const btnLoadMore = document.getElementById('btn-load-more');
  const feedStatusText = document.getElementById('feed-status-text');

  const toastEl = document.getElementById('toast');
  const userAvatarEl = document.getElementById('user-avatar');
  const userNameEl = document.getElementById('user-name');
  const userProfilePill = document.getElementById('user-profile-pill');

  // Modals
  const btnStats = document.getElementById('btn-stats');
  const modalStats = document.getElementById('modal-stats');
  const modalStatsClose = document.getElementById('modal-stats-close');
  const modalStatsBody = document.getElementById('modal-stats-body');

  const modalSearch = document.getElementById('modal-search');
  const modalSearchClose = document.getElementById('modal-search-close');
  const modalSearchBody = document.getElementById('modal-search-body');

  const btnBookmarks = document.getElementById('btn-bookmarks');
  const bookmarksCountBadge = document.getElementById('bookmarks-count-badge');
  const modalBookmarks = document.getElementById('modal-bookmarks');
  const modalBookmarksClose = document.getElementById('modal-bookmarks-close');
  const modalBookmarksBody = document.getElementById('modal-bookmarks-body');

  const modalProfile = document.getElementById('modal-profile');
  const modalProfileClose = document.getElementById('modal-profile-close');
  const modalProfileBody = document.getElementById('modal-profile-body');

  const btnSettings = document.getElementById('btn-settings');
  const modalSettings = document.getElementById('modal-settings');
  const modalSettingsClose = document.getElementById('modal-settings-close');

  const btnChangeFolder = document.getElementById('btn-change-folder');
  const folderBtnText = document.getElementById('folder-btn-text');
  const modalFolder = document.getElementById('modal-folder');
  const modalFolderClose = document.getElementById('modal-folder-close');
  const packagePathInput = document.getElementById('package-path-input');
  const btnSubmitPackagePath = document.getElementById('btn-submit-package-path');
  const folderStatusMessage = document.getElementById('folder-status-message');

  // Lightbox Elements
  const modalLightbox = document.getElementById('modal-lightbox');
  const lightboxMediaWrapper = document.getElementById('lightbox-media-wrapper');
  const lightboxFilename = document.getElementById('lightbox-filename');
  const lightboxCounter = document.getElementById('lightbox-counter');
  const btnLightboxClose = document.getElementById('btn-lightbox-close');
  const btnLightboxPrev = document.getElementById('btn-lightbox-prev');
  const btnLightboxNext = document.getElementById('btn-lightbox-next');
  const btnLightboxZoomIn = document.getElementById('btn-lightbox-zoom-in');
  const btnLightboxZoomOut = document.getElementById('btn-lightbox-zoom-out');
  const btnLightboxZoomReset = document.getElementById('btn-lightbox-zoom-reset');
  const btnLightboxRotate = document.getElementById('btn-lightbox-rotate');
  const btnLightboxCopy = document.getElementById('btn-lightbox-copy');
  const btnLightboxDownload = document.getElementById('btn-lightbox-download');

  // Initialize
  init();

  async function init() {
    loadPreferences();
    updateBookmarksBadge();
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

  function loadPreferences() {
    const savedTheme = localStorage.getItem('discord_export_theme') || 'theme-dark';
    const savedDensity = localStorage.getItem('discord_export_density') || 'density-cozy';
    const savedFontSize = localStorage.getItem('discord_export_font_size') || '15';

    applyTheme(savedTheme);
    applyDensity(savedDensity);
    applyFontSize(savedFontSize);

    // Update settings modal inputs
    document.querySelectorAll('.theme-option-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === savedTheme);
    });
    const densityRadio = document.querySelector(`input[name="display-density"][value="${savedDensity}"]`);
    if (densityRadio) densityRadio.checked = true;

    const slider = document.getElementById('font-size-slider');
    const label = document.getElementById('font-size-label');
    if (slider && label) {
      slider.value = savedFontSize;
      label.textContent = `${savedFontSize}px`;
    }
  }

  function applyTheme(themeClass) {
    appEl.classList.remove('theme-dark', 'theme-midnight', 'theme-light', 'theme-cyberpunk', 'theme-sakura');
    appEl.classList.add(themeClass);
    localStorage.setItem('discord_export_theme', themeClass);
  }

  function applyDensity(densityClass) {
    appEl.classList.remove('density-cozy', 'density-compact');
    appEl.classList.add(densityClass);
    localStorage.setItem('discord_export_density', densityClass);
  }

  function applyFontSize(size) {
    document.documentElement.style.setProperty('--chat-font-size', `${size}px`);
    localStorage.setItem('discord_export_font_size', size);
  }

  function updateBookmarksBadge() {
    if (bookmarks.length > 0) {
      bookmarksCountBadge.style.display = 'inline-block';
      bookmarksCountBadge.textContent = bookmarks.length;
    } else {
      bookmarksCountBadge.style.display = 'none';
    }
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
    // Tab filtering
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        renderChannelList();
      });
    });

    // Sort order toggle
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

    // Channel filter
    channelFilterInput.addEventListener('input', (e) => {
      filterQuery = e.target.value.trim().toLowerCase();
      btnClearFilter.style.display = filterQuery ? 'block' : 'none';
      renderChannelList();
    });

    btnClearFilter.addEventListener('click', () => {
      channelFilterInput.value = '';
      filterQuery = '';
      btnClearFilter.style.display = 'none';
      renderChannelList();
    });

    // In-chat Search Input
    chatSearchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      btnClearChatSearch.style.display = val ? 'block' : 'none';
    });

    chatSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && activeChannel) {
        loadMessages(activeChannel.id, chatSearchInput.value.trim(), true);
      }
    });

    btnClearChatSearch.addEventListener('click', () => {
      chatSearchInput.value = '';
      btnClearChatSearch.style.display = 'none';
      searchMatchControls.style.display = 'none';
      if (activeChannel) loadMessages(activeChannel.id, '', true);
    });

    btnSearchNext.addEventListener('click', () => navigateChatSearchMatch(1));
    btnSearchPrev.addEventListener('click', () => navigateChatSearchMatch(-1));

    // Global Search
    globalSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) performGlobalSearch(query);
      }
    });

    // Date Jump Popover
    btnJumpDateToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      dateJumpPopover.style.display = dateJumpPopover.style.display === 'none' ? 'flex' : 'none';
    });

    dateJumpInput.addEventListener('change', () => {
      const selectedDate = dateJumpInput.value;
      if (selectedDate && activeChannel) {
        jumpToDateInChannel(selectedDate);
        dateJumpPopover.style.display = 'none';
      }
    });

    btnJumpOldest.addEventListener('click', () => {
      if (messageFeedEl) {
        messageFeedEl.scrollTop = 0;
        dateJumpPopover.style.display = 'none';
      }
    });

    btnJumpNewest.addEventListener('click', () => {
      if (messageFeedEl) {
        messageFeedEl.scrollTop = messageFeedEl.scrollHeight;
        dateJumpPopover.style.display = 'none';
      }
    });

    // Export Menu
    btnExportMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDropdownMenu.style.display = exportDropdownMenu.style.display === 'none' ? 'flex' : 'none';
    });

    exportActionHtml.addEventListener('click', (e) => {
      e.preventDefault();
      exportChannelHistory('html');
      exportDropdownMenu.style.display = 'none';
    });

    exportActionCsv.addEventListener('click', (e) => {
      e.preventDefault();
      exportChannelHistory('csv');
      exportDropdownMenu.style.display = 'none';
    });

    exportActionJson.addEventListener('click', (e) => {
      e.preventDefault();
      exportChannelHistory('json');
      exportDropdownMenu.style.display = 'none';
    });

    exportActionTxt.addEventListener('click', (e) => {
      e.preventDefault();
      exportChannelHistory('txt');
      exportDropdownMenu.style.display = 'none';
    });

    // Load older messages
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

    // Launch Actions
    btnLaunchChat.addEventListener('click', (e) => {
      e.preventDefault();
      if (!activeChannel) return;

      if (activeChannel.isDeletedUser && (!activeChannel.recipientId || activeChannel.recipientId === 'Deleted User')) {
        showToast('Discord closes DMs server-side when an account is deleted. Full history is preserved locally.');
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
        setTimeout(() => { window.open(webUri, '_blank'); }, 350);
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
      setTimeout(() => { window.open(webUri, '_blank'); }, 350);
      showToast(`Opening profile in Discord...`);
    });

    btnCopyTag.addEventListener('click', () => {
      if (activeChannel?.recipientId && activeChannel.recipientId !== 'Deleted User') {
        const tag = `<@${activeChannel.recipientId}>`;
        copyToClipboard(tag, `Copied mention tag ${tag}!`);
      } else {
        showToast('No User ID available for this deleted account.');
      }
    });

    btnCopySearch.addEventListener('click', () => {
      const filterValue = activeChannel?.recipientId && activeChannel.recipientId !== 'Deleted User'
        ? `from:${activeChannel.recipientId}`
        : (activeChannel?.recipientHandle ? `from:${cleanName(activeChannel.recipientHandle)}` : `from:${activeChannel.id}`);
      
      copyToClipboard(filterValue, `Copied search filter "${filterValue}" (Paste into Discord Ctrl+F)`);
    });

    btnCopyRawId.addEventListener('click', () => {
      const targetId = activeChannel?.recipientId || activeChannel?.id;
      if (targetId) copyToClipboard(targetId, `Copied ID ${targetId}`);
    });

    // Folder Selector Modal
    btnChangeFolder.addEventListener('click', () => { modalFolder.style.display = 'flex'; });
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

    btnBookmarks.addEventListener('click', openBookmarksModal);
    modalBookmarksClose.addEventListener('click', () => modalBookmarks.style.display = 'none');

    userProfilePill.addEventListener('click', openProfileModal);
    modalProfileClose.addEventListener('click', () => modalProfile.style.display = 'none');

    btnSettings.addEventListener('click', () => { modalSettings.style.display = 'flex'; });
    modalSettingsClose.addEventListener('click', () => modalSettings.style.display = 'none');

    // Theme Picker
    document.querySelectorAll('.theme-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.theme-option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyTheme(btn.dataset.theme);
      });
    });

    // Display Density
    document.querySelectorAll('input[name="display-density"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        applyDensity(e.target.value);
      });
    });

    // Font size slider
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeLabel = document.getElementById('font-size-label');
    fontSizeSlider.addEventListener('input', (e) => {
      const val = e.target.value;
      fontSizeLabel.textContent = `${val}px`;
      applyFontSize(val);
    });

    // Lightbox Controls
    btnLightboxClose.addEventListener('click', closeLightbox);
    btnLightboxPrev.addEventListener('click', () => navigateLightbox(-1));
    btnLightboxNext.addEventListener('click', () => navigateLightbox(1));
    btnLightboxZoomIn.addEventListener('click', () => { lightboxZoom = Math.min(3, lightboxZoom + 0.25); updateLightboxTransform(); });
    btnLightboxZoomOut.addEventListener('click', () => { lightboxZoom = Math.max(0.5, lightboxZoom - 0.25); updateLightboxTransform(); });
    btnLightboxZoomReset.addEventListener('click', () => { lightboxZoom = 1; lightboxRotation = 0; updateLightboxTransform(); });
    btnLightboxRotate.addEventListener('click', () => { lightboxRotation = (lightboxRotation + 90) % 360; updateLightboxTransform(); });
    btnLightboxCopy.addEventListener('click', () => {
      if (galleryImages[currentLightboxIndex]) {
        copyToClipboard(galleryImages[currentLightboxIndex].url, 'Copied image link to clipboard!');
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Lightbox navigation
      if (modalLightbox.style.display === 'flex') {
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') navigateLightbox(-1);
        else if (e.key === 'ArrowRight') navigateLightbox(1);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        globalSearchInput.focus();
        globalSearchInput.select();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        openStatsModal();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        openBookmarksModal();
      } else if (e.key === 'Escape') {
        closeAllModals();
      }
    });

    // Close dropdowns & popovers on background click
    window.addEventListener('click', (e) => {
      if (!e.target.closest('.date-jump-wrapper')) dateJumpPopover.style.display = 'none';
      if (!e.target.closest('.export-dropdown-wrapper')) exportDropdownMenu.style.display = 'none';
      if (e.target === modalStats) modalStats.style.display = 'none';
      if (e.target === modalSearch) modalSearch.style.display = 'none';
      if (e.target === modalFolder) modalFolder.style.display = 'none';
      if (e.target === modalBookmarks) modalBookmarks.style.display = 'none';
      if (e.target === modalProfile) modalProfile.style.display = 'none';
      if (e.target === modalSettings) modalSettings.style.display = 'none';
    });
  }

  function closeAllModals() {
    modalStats.style.display = 'none';
    modalSearch.style.display = 'none';
    modalFolder.style.display = 'none';
    modalBookmarks.style.display = 'none';
    modalProfile.style.display = 'none';
    modalSettings.style.display = 'none';
    dateJumpPopover.style.display = 'none';
    exportDropdownMenu.style.display = 'none';
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
        const idMatch = (c.recipientId || '').includes(filterQuery) || (c.id || '').includes(filterQuery);
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
    btnClearChatSearch.style.display = 'none';
    searchMatchControls.style.display = 'none';
    loadMessages(channel.id, '', true);
  }

  async function loadMessages(channelId, search = '', reset = true) {
    if (isLoadingMessages) return;
    isLoadingMessages = true;

    if (reset) {
      activeOffset = 0;
      galleryImages = [];
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

      // Collect image gallery URLs
      messages.forEach(m => {
        if (m.Attachments) {
          m.Attachments.split(/\s+/).forEach(url => {
            if (/\.(png|jpg|jpeg|webp|gif|svg)/i.test(url)) {
              galleryImages.push({ url, id: m.ID });
            }
          });
        }
      });

      const html = messages.map(msg => renderMessageCard(msg, search)).join('');
      
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

      // Setup Search Matches Controls if searching
      if (search) {
        chatSearchResults = Array.from(messageFeedEl.querySelectorAll('.search-highlight'));
        if (chatSearchResults.length > 0) {
          searchMatchControls.style.display = 'flex';
          currentMatchIndex = 0;
          updateSearchMatchHighlight();
        } else {
          searchMatchControls.style.display = 'none';
        }
      } else {
        searchMatchControls.style.display = 'none';
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

  function renderMessageCard(msg, highlightTerm = '') {
    const isMe = accountData && (String(msg.AuthorID) === String(accountData.id) || !msg.AuthorID);
    const authorName = isMe ? cleanName(accountData.global_name || accountData.username || 'You') : cleanName(activeChannel?.recipientHandle || activeChannel?.name || 'User');
    const avatarLetter = authorName.charAt(0).toUpperCase();
    const isStarred = bookmarks.some(b => b.msgId === msg.ID);

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

    const rawContent = msg.Contents || '';
    const formattedContent = parseDiscordMarkdown(rawContent, highlightTerm);
    const mediaHtml = renderMessageMedia(rawContent, msg.Attachments || '');

    return `
      <div class="message-item" id="msg-${msg.ID}" data-id="${msg.ID}">
        ${avatarHtml}
        <div class="msg-content-wrapper">
          <div class="msg-header">
            <span class="msg-author">${escapeHtml(authorName)}</span>
            <span class="msg-timestamp">${formattedTime}</span>
          </div>
          <div class="msg-text">${formattedContent}</div>
          ${mediaHtml}
        </div>
        <div class="msg-actions-bar">
          <button class="msg-action-btn ${isStarred ? 'is-starred' : ''}" onclick="toggleBookmark('${msg.ID}')" title="${isStarred ? 'Remove Star' : 'Star / Bookmark'}">⭐</button>
          <button class="msg-action-btn" onclick="copyMessageText('${msg.ID}')" title="Copy Message Text">📋</button>
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

          if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
            html += `
              <div class="msg-media-block">
                <img src="${escapeHtml(cleanUrl)}" alt="${escapeHtml(filename)}" class="msg-inline-img" onclick="openLightbox('${escapeHtml(cleanUrl)}', '${escapeHtml(filename)}')" onerror="this.style.display='none';" />
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

    // YouTube Embeds
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

    // Spotify Embeds
    const spotifyRegex = /https?:\/\/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/gi;
    let spotifyMatch;
    const embeddedSpotify = new Set();
    while ((spotifyMatch = spotifyRegex.exec(contents)) !== null) {
      const type = spotifyMatch[1];
      const spotId = spotifyMatch[2];
      const embedKey = `${type}/${spotId}`;
      if (!embeddedSpotify.has(embedKey)) {
        embeddedSpotify.add(embedKey);
        const height = type === 'track' ? 80 : 152;
        html += `
          <div class="msg-embed-container spotify-embed" style="max-width: 480px; margin-top: 8px;">
            <iframe src="https://open.spotify.com/embed/${type}/${spotId}" width="100%" height="${height}" frameBorder="0" allowtransparency="true" allow="encrypted-media" style="border-radius: 8px; display: block;"></iframe>
          </div>
        `;
      }
    }

    return html;
  }

  // Full Fidelity Discord Markdown Engine
  function parseDiscordMarkdown(text, highlightTerm = '') {
    if (!text) return '';
    let escaped = escapeHtml(text);

    // 1. Multiline Code blocks: ```lang\ncode```
    escaped = escaped.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const displayLang = lang ? lang.toUpperCase() : 'CODE';
      return `<div class="codeblock-wrapper"><div class="codeblock-header"><span>${escapeHtml(displayLang)}</span><button class="btn-copy-code" onclick="copyCodeText(this)">Copy</button></div><pre><code>${code}</code></pre></div>`;
    });

    // 2. Inline Code: `code`
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 3. Auto-link URLs (run before injecting HTML tags with src/href)
    const urlRegex = /(https?:\/\/[^\s<"'>]+)/g;
    escaped = escaped.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: var(--brand-blurple); text-decoration: underline;">$1</a>');

    // 4. Custom Animated & Static Discord Emojis: <:name:id> or <a:name:id>
    escaped = escaped.replace(/&lt;(a)?:([a-zA-Z0-9_]+):(\d+)&gt;/g, (match, isAnim, name, id) => {
      const ext = isAnim ? 'gif' : 'png';
      const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=48&quality=lossless`;
      return `<img class="discord-custom-emoji" src="${url}" alt=":${name}:" title=":${name}:" onerror="this.onerror=null; this.src='https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f389.svg';" />`;
    });

    // 5. Interactive Spoilers: ||text||
    escaped = escaped.replace(/\|\|([\s\S]+?)\|\|/g, '<span class="discord-spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');

    // 6. Discord Timestamps: <t:1700000000:R>, <t:1700000000:F>, etc.
    escaped = escaped.replace(/&lt;t:(\d+)(?::([tTdDfFR]))?&gt;/g, (match, ts, style) => {
      const date = new Date(parseInt(ts) * 1000);
      const relative = getRelativeTimeString(date);
      const full = date.toLocaleString();
      return `<span class="discord-timestamp-badge" title="${full}">${relative}</span>`;
    });

    // 7. Channel Mentions: <#channel_id>
    escaped = escaped.replace(/&lt;#(\d+)&gt;/g, (match, chId) => {
      return `<span class="channel-mention-pill" onclick="jumpToChannel('${chId}')">#channel</span>`;
    });

    // 8. User Mentions: <@user_id> or <@!user_id>
    escaped = escaped.replace(/&lt;@!?(\d+)&gt;/g, '<span class="user-mention-pill">@$1</span>');

    // 9. Role Mentions: <@&role_id>
    escaped = escaped.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="role-mention-pill">@role</span>');

    // 10. Subtext: -# text
    escaped = escaped.replace(/^-#\s+(.+)$/gm, '<span class="discord-subtext">$1</span>');

    // 11. Headers: # H1, ## H2, ### H3
    escaped = escaped.replace(/^###\s+(.+)$/gm, '<h4 style="color: var(--text-bold); margin: 6px 0;">$1</h4>');
    escaped = escaped.replace(/^##\s+(.+)$/gm, '<h3 style="color: var(--text-bold); margin: 6px 0;">$1</h3>');
    escaped = escaped.replace(/^#\s+(.+)$/gm, '<h2 style="color: var(--text-bold); margin: 6px 0;">$1</h2>');

    // 12. Blockquotes: > quote
    escaped = escaped.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

    // 13. Formatting: Bold, Italic, Strikethrough, Underline
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    escaped = escaped.replace(/__([^_]+)__/g, '<u>$1</u>');

    // 14. Highlight search matches if present
    if (highlightTerm) {
      const regex = new RegExp(`(${escapeRegex(highlightTerm)})`, 'gi');
      escaped = escaped.replace(regex, '<span class="search-highlight">$1</span>');
    }

    return escaped;
  }

  function getRelativeTimeString(date) {
    const now = new Date();
    const diffSec = Math.round((date - now) / 1000);
    const absDiff = Math.abs(diffSec);

    if (absDiff < 60) return diffSec < 0 ? `${absDiff}s ago` : `in ${absDiff}s`;
    const diffMin = Math.round(diffSec / 60);
    if (Math.abs(diffMin) < 60) return diffMin < 0 ? `${Math.abs(diffMin)}m ago` : `in ${diffMin}m`;
    const diffHr = Math.round(diffMin / 60);
    if (Math.abs(diffHr) < 24) return diffHr < 0 ? `${Math.abs(diffHr)}h ago` : `in ${diffHr}h`;
    const diffDay = Math.round(diffHr / 24);
    if (Math.abs(diffDay) < 30) return diffDay < 0 ? `${Math.abs(diffDay)}d ago` : `in ${diffDay}d`;
    return date.toLocaleDateString();
  }

  function updateSearchMatchHighlight() {
    chatSearchResults.forEach((el, idx) => {
      el.classList.toggle('active-match', idx === currentMatchIndex);
    });
    searchMatchCounter.textContent = `${currentMatchIndex + 1}/${chatSearchResults.length}`;
    if (chatSearchResults[currentMatchIndex]) {
      chatSearchResults[currentMatchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function navigateChatSearchMatch(dir) {
    if (chatSearchResults.length === 0) return;
    currentMatchIndex = (currentMatchIndex + dir + chatSearchResults.length) % chatSearchResults.length;
    updateSearchMatchHighlight();
  }

  // Lightbox Viewer
  window.openLightbox = function(url, filename) {
    modalLightbox.style.display = 'flex';
    currentLightboxIndex = galleryImages.findIndex(img => img.url === url);
    if (currentLightboxIndex === -1) {
      galleryImages.push({ url, id: 'custom' });
      currentLightboxIndex = galleryImages.length - 1;
    }
    lightboxZoom = 1;
    lightboxRotation = 0;
    renderActiveLightboxMedia(url, filename);
  };

  function renderActiveLightboxMedia(url, filename) {
    lightboxFilename.textContent = filename || 'Attachment';
    lightboxCounter.textContent = `${currentLightboxIndex + 1} of ${galleryImages.length}`;
    btnLightboxDownload.href = url;
    lightboxMediaWrapper.innerHTML = `<img src="${escapeHtml(url)}" alt="Preview" style="transform: scale(${lightboxZoom}) rotate(${lightboxRotation}deg);" />`;
  }

  function updateLightboxTransform() {
    const img = lightboxMediaWrapper.querySelector('img');
    if (img) {
      img.style.transform = `scale(${lightboxZoom}) rotate(${lightboxRotation}deg)`;
    }
    btnLightboxZoomReset.textContent = `${Math.round(lightboxZoom * 100)}%`;
  }

  function navigateLightbox(dir) {
    if (galleryImages.length === 0) return;
    currentLightboxIndex = (currentLightboxIndex + dir + galleryImages.length) % galleryImages.length;
    const item = galleryImages[currentLightboxIndex];
    lightboxZoom = 1;
    lightboxRotation = 0;
    renderActiveLightboxMedia(item.url, item.url.split('/').pop().split('?')[0]);
  }

  function closeLightbox() {
    modalLightbox.style.display = 'none';
  }

  // Global Search
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
        <p style="margin-bottom: 12px; color: var(--text-muted); font-size: 0.85rem;">Found ${data.total} matching messages (displaying up to 1,000):</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${data.results.map(r => `
            <div class="message-item" style="background: var(--bg-tertiary); cursor: pointer;" onclick="jumpToChannel('${r.channelId}')">
              <div class="msg-content-wrapper">
                <div class="msg-header">
                  <span class="msg-author">${escapeHtml(cleanName(r.channelName))} ${r.guildName ? `(${escapeHtml(r.guildName)})` : ''}</span>
                  <span class="msg-timestamp">${r.message.Timestamp || ''}</span>
                </div>
                <div class="msg-text">${parseDiscordMarkdown(r.message.Contents, query)}</div>
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
    closeAllModals();
    const channel = allChannels.find(c => String(c.id) === String(channelId));
    if (channel) selectChannel(channel);
  };

  // Jump to Date in Channel
  function jumpToDateInChannel(targetDateStr) {
    if (!activeChannel) return;
    loadMessages(activeChannel.id, '', true);
    showToast(`Jumped to date: ${targetDateStr}`);
  }

  // Channel Export Trigger
  function exportChannelHistory(format) {
    if (!activeChannel) return;
    const url = `/api/channel/${activeChannel.id}/export?format=${format}`;
    window.open(url, '_blank');
    showToast(`Generating ${format.toUpperCase()} export for ${cleanName(activeChannel.name)}...`);
  }

  // Bookmarking System
  window.toggleBookmark = function(msgId) {
    const index = bookmarks.findIndex(b => b.msgId === msgId);
    if (index !== -1) {
      bookmarks.splice(index, 1);
      showToast('Removed from Starred Bookmarks');
    } else {
      const msgEl = document.getElementById(`msg-${msgId}`);
      const text = msgEl ? msgEl.querySelector('.msg-text')?.innerText : '';
      bookmarks.push({
        msgId,
        channelId: activeChannel.id,
        channelName: cleanName(activeChannel.name),
        text,
        date: new Date().toISOString()
      });
      showToast('⭐ Message saved to Bookmarks!');
    }
    localStorage.setItem('discord_export_bookmarks', JSON.stringify(bookmarks));
    updateBookmarksBadge();
    
    // Update active button state
    const btn = document.querySelector(`#msg-${msgId} .msg-action-btn`);
    if (btn) btn.classList.toggle('is-starred', index === -1);
  };

  window.copyMessageText = function(msgId) {
    const msgEl = document.getElementById(`msg-${msgId}`);
    const text = msgEl ? msgEl.querySelector('.msg-text')?.innerText : '';
    if (text) copyToClipboard(text, 'Copied message to clipboard!');
  };

  window.copyCodeText = function(btn) {
    const pre = btn.closest('.codeblock-wrapper')?.querySelector('pre code');
    if (pre) {
      copyToClipboard(pre.innerText, 'Copied code block to clipboard!');
    }
  };

  function openBookmarksModal() {
    modalBookmarks.style.display = 'flex';
    if (bookmarks.length === 0) {
      modalBookmarksBody.innerHTML = `<div class="empty-state"><h3>No Bookmarked Messages</h3><p>Click the ⭐ star icon next to any message to save it here for quick access.</p></div>`;
      return;
    }

    modalBookmarksBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${bookmarks.map(b => `
          <div class="message-item" style="background: var(--bg-tertiary); cursor: pointer;" onclick="jumpToChannel('${b.channelId}')">
            <div class="msg-content-wrapper">
              <div class="msg-header">
                <span class="msg-author">💬 ${escapeHtml(b.channelName)}</span>
                <span class="msg-timestamp">${new Date(b.date).toLocaleDateString()}</span>
              </div>
              <div class="msg-text">${escapeHtml(b.text)}</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); toggleBookmark('${b.msgId}'); openBookmarksModal();" style="align-self: flex-start;">Remove</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Profile Modal
  function openProfileModal() {
    modalProfile.style.display = 'flex';
    if (!accountData) {
      modalProfileBody.innerHTML = `<div class="loading-state">Loading user profile...</div>`;
      return;
    }

    const conns = accountData.connected_accounts || [];
    const rels = accountData.relationships || [];

    modalProfileBody.innerHTML = `
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
        <div class="user-avatar-small" style="width: 60px; height: 60px; font-size: 1.5rem;">
          <img src="/api/account/avatar" alt="Avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <span class="avatar-fallback" style="display: none;">${accountData.global_name ? accountData.global_name.charAt(0).toUpperCase() : 'U'}</span>
        </div>
        <div>
          <h3 style="color: var(--text-bold); font-size: 1.2rem; margin-bottom: 2px;">${escapeHtml(accountData.global_name || accountData.username)}</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; font-family: var(--font-code);">${escapeHtml(accountData.username)}</p>
          <p style="color: var(--brand-blurple); font-size: 0.8rem; font-family: var(--font-code);">ID: ${escapeHtml(accountData.id)}</p>
        </div>
      </div>

      ${accountData.bio ? `<div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 0.88rem; color: var(--text-normal);">${escapeHtml(accountData.bio)}</div>` : ''}

      <h4 style="color: var(--text-bold); margin-bottom: 10px; font-size: 0.95rem;">Connected Accounts (${conns.length})</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-bottom: 20px;">
        ${conns.length > 0 ? conns.map(c => `
          <div style="background: var(--bg-tertiary); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); font-size: 0.82rem;">
            <div style="font-weight: 700; color: var(--text-bold); text-transform: capitalize;">${escapeHtml(c.type)}</div>
            <div style="color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(c.name || c.id)}</div>
          </div>
        `).join('') : '<p style="color: var(--text-muted); font-size: 0.85rem;">No connected accounts found.</p>'}
      </div>

      <h4 style="color: var(--text-bold); margin-bottom: 10px; font-size: 0.95rem;">Relationships & Friends (${rels.length})</h4>
      <div style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto;">
        ${rels.length > 0 ? rels.map(r => `
          <div style="background: var(--bg-tertiary); padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; display: flex; justify-content: space-between;">
            <span style="color: var(--text-bold);">👤 ${escapeHtml(r.user?.global_name || r.user?.username || r.id)}</span>
            <code style="color: var(--brand-blurple); font-size: 0.75rem;">${escapeHtml(r.id)}</code>
          </div>
        `).join('') : '<p style="color: var(--text-muted); font-size: 0.85rem;">No relationships records found.</p>'}
      </div>
    `;
  }

  // Interactive Analytics Studio Modal
  async function openStatsModal() {
    modalStats.style.display = 'flex';
    modalStatsBody.innerHTML = `<div class="loading-state">Calculating comprehensive analytics & heatmaps...</div>`;

    try {
      const res = await fetch('/api/stats/advanced');
      const stats = await res.json();

      const basicRes = await fetch('/api/stats');
      const basicStats = await basicRes.json();

      // Render 24x7 Activity Heatmap SVG
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      let maxHeat = 1;
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          if (stats.heatmap[d][h] > maxHeat) maxHeat = stats.heatmap[d][h];
        }
      }

      let heatmapSvg = `<svg width="100%" height="160" viewBox="0 0 740 160" style="display: block;">`;
      // Hour labels
      for (let h = 0; h < 24; h += 3) {
        const x = 50 + h * 28;
        heatmapSvg += `<text x="${x}" y="14" font-size="10" fill="var(--text-muted)" font-family="var(--font-code)">${h}:00</text>`;
      }
      // Heatmap grid
      for (let d = 0; d < 7; d++) {
        const y = 24 + d * 18;
        heatmapSvg += `<text x="10" y="${y + 12}" font-size="10" fill="var(--text-muted)" font-family="var(--font-code)">${dayNames[d]}</text>`;
        for (let h = 0; h < 24; h++) {
          const val = stats.heatmap[d][h];
          const intensity = val / maxHeat;
          const x = 50 + h * 28;
          const color = val === 0 ? 'rgba(255,255,255,0.04)' : `rgba(88, 101, 242, ${Math.max(0.2, intensity)})`;
          heatmapSvg += `<rect x="${x}" y="${y}" width="24" height="14" rx="3" fill="${color}"><title>${dayNames[d]} ${h}:00 - ${val} messages</title></rect>`;
        }
      }
      heatmapSvg += `</svg>`;

      // Monthly Timeline SVG
      let timelineSvg = `<svg width="100%" height="140" viewBox="0 0 740 140" style="display: block;">`;
      const months = stats.monthlyTimeline || [];
      const maxMonth = Math.max(...months.map(m => m.count), 1);
      const colWidth = Math.min(40, Math.max(14, Math.floor(660 / Math.max(1, months.length))));

      months.forEach((m, idx) => {
        const h = Math.max(4, Math.round((m.count / maxMonth) * 90));
        const x = 40 + idx * (colWidth + 4);
        const y = 105 - h;
        timelineSvg += `
          <rect x="${x}" y="${y}" width="${colWidth}" height="${h}" rx="3" fill="var(--brand-blurple)">
            <title>${m.month}: ${m.count.toLocaleString()} msgs</title>
          </rect>
          <text x="${x + colWidth / 2}" y="125" font-size="9" fill="var(--text-muted)" text-anchor="middle" font-family="var(--font-code)">${m.month.slice(2)}</text>
        `;
      });
      timelineSvg += `</svg>`;

      modalStatsBody.innerHTML = `
        <!-- Metrics Grid -->
        <div class="analytics-metric-grid">
          <div class="metric-card">
            <div class="metric-value">${stats.totalMessages.toLocaleString()}</div>
            <div class="metric-label">Total Sent Messages</div>
          </div>
          <div class="metric-card">
            <div class="metric-value" style="color: var(--status-green);">${basicStats.dmCount}</div>
            <div class="metric-label">Direct Message Chats</div>
          </div>
          <div class="metric-card">
            <div class="metric-value" style="color: var(--status-yellow);">${stats.activityStreaks.activeDays}</div>
            <div class="metric-label">Active Chatting Days</div>
          </div>
          <div class="metric-card">
            <div class="metric-value" style="color: var(--text-bold);">${stats.attachmentStats.total}</div>
            <div class="metric-label">Total Media Files</div>
          </div>
        </div>

        <!-- 24x7 Activity Heatmap -->
        <div class="analytics-chart-box">
          <h4>📅 24/7 Activity Heatmap (UTC)</h4>
          <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 12px;">Visual breakdown of sent messages by day of the week and hour of day.</p>
          ${heatmapSvg}
        </div>

        <!-- Monthly Timeline -->
        <div class="analytics-chart-box">
          <h4>📈 Monthly Message Volume Timeline</h4>
          ${timelineSvg}
        </div>

        <!-- Top Contacts & Top Servers Leaderboards -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div class="analytics-chart-box" style="margin-bottom: 0;">
            <h4>👤 Top Direct Message Contacts</h4>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${basicStats.topDms.map(d => `
                <div style="display: flex; justify-content: space-between; background: var(--bg-secondary); padding: 8px 12px; border-radius: 6px; font-size: 0.85rem;">
                  <span>👤 ${escapeHtml(cleanName(d.name))}</span>
                  <span style="font-weight: 600; color: var(--text-bold);">${d.messageCount} msgs</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="analytics-chart-box" style="margin-bottom: 0;">
            <h4>🏰 Top Active Servers</h4>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${basicStats.topGuilds.map(g => `
                <div style="display: flex; justify-content: space-between; background: var(--bg-secondary); padding: 8px 12px; border-radius: 6px; font-size: 0.85rem;">
                  <span>🏰 ${escapeHtml(cleanName(g.name))}</span>
                  <span style="font-weight: 600; color: var(--text-bold);">${g.count} msgs</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Top Emojis & Top Words -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="analytics-chart-box">
            <h4>😃 Most Used Custom Emojis</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${stats.topEmojis.length > 0 ? stats.topEmojis.map(e => `
                <span class="attachment-pill" style="font-size: 0.8rem; padding: 4px 8px;">${escapeHtml(e.emoji)} <strong>(${e.count})</strong></span>
              `).join('') : '<p style="color: var(--text-muted); font-size: 0.85rem;">No custom emojis found.</p>'}
            </div>
          </div>

          <div class="analytics-chart-box">
            <h4>💬 Top Vocabulary & Keywords</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${stats.topWords.length > 0 ? stats.topWords.map(w => `
                <span class="attachment-pill" style="font-size: 0.8rem; padding: 4px 8px;">${escapeHtml(w.word)} <strong>(${w.count})</strong></span>
              `).join('') : '<p style="color: var(--text-muted); font-size: 0.85rem;">No words logged.</p>'}
        <!-- Bulk Exporters & Actions -->
        <div style="margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn btn-secondary" onclick="copyAllContactIds()">📋 Copy All DM User IDs</button>
          <button class="btn btn-secondary" onclick="exportBookmarksToHtml()">⭐ Export Bookmarks as HTML</button>
        </div>
      `;

    } catch (err) {
      console.error('Stats failed:', err);
      modalStatsBody.innerHTML = `<div class="loading-state">Failed to calculate advanced statistics.</div>`;
    }
  }

  window.copyAllContactIds = function() {
    const dms = allChannels.filter(c => c.type === 'DM' && c.recipientId && c.recipientId !== 'Deleted User');
    if (dms.length === 0) {
      showToast('No valid DM contact IDs found.');
      return;
    }
    const lines = dms.map(d => `${cleanName(d.name || d.recipientHandle)}: ${d.recipientId} (<@${d.recipientId}>)`).join('\n');
    copyToClipboard(lines, `Copied ${dms.length} DM Contact User IDs!`);
  };

  window.exportBookmarksToHtml = function() {
    if (bookmarks.length === 0) {
      showToast('No starred messages to export.');
      return;
    }
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Discord Starred Messages Export</title>
<style>body{font-family:sans-serif;background:#313338;color:#dbdee1;padding:20px;}.card{background:#2b2d31;padding:12px;border-radius:6px;margin-bottom:10px;border:1px solid rgba(255,255,255,0.08);}.title{font-weight:bold;color:#f2f3f5;margin-bottom:4px;}.time{font-size:0.75rem;color:#949ba4;}</style></head><body><h1>⭐ Starred Messages (${bookmarks.length})</h1>`;
    bookmarks.forEach(b => {
      html += `<div class="card"><div class="title">💬 ${escapeHtml(b.channelName)} <span class="time">${new Date(b.date).toLocaleString()}</span></div><div>${escapeHtml(b.text)}</div></div>`;
    });
    html += `</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `discord_starred_messages_${Date.now()}.html`;
    a.click();
    showToast('Downloaded Starred Messages HTML!');
  };

  function copyToClipboard(text, toastMsg) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(toastMsg || 'Copied to clipboard!');
    }).catch(() => {
      // Fallback copy
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(toastMsg || 'Copied to clipboard!');
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

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
});
