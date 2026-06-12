'use strict';

// ═══════════════════════════════════════════════════════════════
//  ROUTER
// ═══════════════════════════════════════════════════════════════

function renderView() {
  if (state.currentView === 'dashboard') renderDashboard();
  else if (state.currentView === 'accounts') renderAccountsList();
  else if (state.currentView === 'projects') renderProjectsList();
  else if (state.currentView === 'groups') renderGroupsView();
  else if (state.currentView === 'timeline') renderTimeline();
  else if (state.currentView === 'report') renderReport();
  else if (state.currentView === 'heatmap') renderHeatmap();
  else if (state.currentView === 'rotation') renderRotation();
  else if (state.currentView === 'cost') renderCost();
  else if (state.currentView === 'compare') renderCompare();
  else if (state.currentView === 'prompts') renderPrompts();
  else if (state.currentView === 'chats') renderChats();
  else if (state.currentView === 'messages') renderMessages();
  else if (state.currentView === 'settings') renderSettings();
}

function switchView(name) {
  state.currentView = name;
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
  const views = ['dashboard', 'accounts', 'projects', 'groups', 'timeline', 'report', 'heatmap', 'rotation', 'cost', 'compare', 'prompts', 'chats', 'messages', 'settings'];
  let found = false;
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      const isActive = v === name;
      el.classList.toggle('active', isActive);
      if (isActive) found = true;
    }
  });
  const view404 = document.getElementById('view-404');
  if (view404) view404.classList.toggle('active', !found);
  renderView();
}

// ═══════════════════════════════════════════════════════════════
//  BIND UI EVENTS
// ═══════════════════════════════════════════════════════════════

function bindUIEvents() {
  // Sidebar navigation
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) switchView(view);
      closeSidebar();
    });
  });

  // Sidebar toggle (hamburger)
  document.getElementById('sidebar-toggle')?.addEventListener('click', openSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

  // Dashboard + Add Account button
  document.getElementById('add-account-btn')?.addEventListener('click', () => openAccountModal());
  document.getElementById('add-project-btn')?.addEventListener('click', () => openProjectModal());
  document.getElementById('add-fab')?.addEventListener('click', () => openAccountModal());

  // Account modal events
  const saveAccountBtn = document.getElementById('save-account-btn');
  if (saveAccountBtn) saveAccountBtn.addEventListener('click', handleSaveAccount);

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      if (state.currentView === 'dashboard') renderDashboard();
    });
  });

  // Search
  document.querySelectorAll('[data-search]').forEach(input => {
    input.addEventListener('input', () => {
      const view = input.dataset.search;
      const query = input.value.trim();
      if (view === 'prompts') renderPrompts(query);
      else if (view === 'chats') renderChats(query);
      else if (view === 'messages') renderMessages(query);
    });
  });

  // Platform buttons in account modal
  document.querySelectorAll('.platform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedPlatform = btn.dataset.platform;
      const customGroup = document.getElementById('custom-platform-group');
      const customInput = document.getElementById('custom-platform-name');
      if (btn.dataset.platform === 'Other') {
        customGroup.classList.remove('hidden');
        customInput.focus();
      } else {
        customGroup.classList.add('hidden');
        customInput.value = '';
      }
    });
  });

  // Type toggle in account modal
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedAccountType = btn.dataset.type;
      const priceWrapper = document.getElementById('account-price-wrapper');
      const custWrapper = document.getElementById('custom-type-wrapper');
      if (priceWrapper) priceWrapper.classList.toggle('hidden', state.selectedAccountType === 'free');
      if (custWrapper) custWrapper.classList.toggle('hidden', state.selectedAccountType !== 'other');
    });
  });

  // Project modal events
  const saveProjectBtn = document.getElementById('save-project-btn');
  if (saveProjectBtn) saveProjectBtn.addEventListener('click', handleSaveProject);

  // Color swatches
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      swatch.closest('.color-picker')?.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      state.selectedColor = swatch.dataset.color;
    });
  });

  // Limit modal events
  const saveLimitBtn = document.getElementById('save-limit-btn');
  if (saveLimitBtn) saveLimitBtn.addEventListener('click', handleSaveLimit);

  // Quick time buttons in limit modal
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const hours = parseFloat(btn.dataset.hours);
      if (!isNaN(hours)) {
        const suggested = new Date(Date.now() + hours * 3600000);
        document.getElementById('reset-datetime').value = toDatetimeLocalValue(suggested);
      }
    });
  });

  // Reason chips
  document.querySelectorAll('.reason-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const container = chip.closest('.reason-chip-group') || chip.parentElement;
      container.querySelectorAll('.reason-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const noteInput = document.getElementById('limit-note');
      if (noteInput) {
        if (chip.dataset.reason === 'Other') {
          noteInput.style.display = 'block';
          noteInput.focus();
        } else {
          noteInput.style.display = 'none';
          noteInput.value = '';
        }
      }
    });
  });

  // Bulk import events
  const bulkTextarea = document.getElementById('bulk-textarea');
  if (bulkTextarea) bulkTextarea.addEventListener('input', previewBulkImport);
  const importBulkBtn = document.getElementById('import-bulk-btn');
  if (importBulkBtn) importBulkBtn.addEventListener('click', handleBulkImport);
}

// ═══════════════════════════════════════════════════════════════
//  NOTIFICATION HISTORY
// ═══════════════════════════════════════════════════════════════

function getNotifHistory() {
  if (state.notifHistory.length) return state.notifHistory;
  try { return JSON.parse(localStorage.getItem('limitless_notif_history') || '[]'); }
  catch { return []; }
}

function addNotifHistory(platform, email) {
  const history = getNotifHistory();
  history.unshift({ platform, email, time: new Date().toISOString() });
  const trimmed = history.slice(0, 30);
  state.notifHistory = trimmed;
  localStorage.setItem('limitless_notif_history', JSON.stringify(trimmed));
  if (typeof setUserData === 'function') setUserData('notifHistory', trimmed).catch(e => console.warn('Sync failed:', e));
  $('bell-dot')?.classList.remove('hidden');
}

function renderNotifList() {
  const list = $('notif-list');
  if (!list) return;
  const items = getNotifHistory();
  if (items.length === 0) {
    list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }
  list.innerHTML = items.map(item => {
    const d = new Date(item.time);
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const color = PLATFORM_COLORS[item.platform] || PLATFORM_COLORS.Other;
    return `
      <div class="notif-item">
        <span class="notif-dot" style="background:${color}"></span>
        <div class="notif-item-body">
          <div class="notif-item-title">${escHtml(item.platform)} reset</div>
          <div class="notif-item-sub">${escHtml(item.email || '')} · ${dateStr} ${timeStr}</div>
        </div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
//  SYNC BADGE
// ═══════════════════════════════════════════════════════════════

let _lastSyncTime = null;
function updateSyncBadge() {
  const el = document.getElementById('sync-badge');
  const text = document.getElementById('sync-text');
  if (!el || !text) return;
  _lastSyncTime = new Date();
  if (!navigator.onLine || queueSize() > 0) {
    const q = queueSize();
    el.classList.remove('syncing');
    text.textContent = q > 0 ? `${q} pending` : 'Offline';
  } else {
    el.classList.remove('syncing');
    text.textContent = 'Synced';
  }
}
function markSyncing() {
  const el = document.getElementById('sync-badge');
  const text = document.getElementById('sync-text');
  if (!el || !text) return;
  el.classList.add('syncing');
  text.textContent = 'Syncing…';
}

// Patch loadAll to update sync badge
const _origLoadAll = loadAll;
loadAll = async function(opts = {}) {
  markSyncing();
  try { return await _origLoadAll(opts); }
  finally { updateSyncBadge(); }
};

// ─── EXPORT ─────────────────────────────────────────────────

function initExport() {
  const btn = document.getElementById('export-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const text = buildExportText();
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `accounts-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {}
    showSuccess('Exported ↓');
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1200);
  });
}

// ═══════════════════════════════════════════════════════════════
//  PWA INSTALL PROMPT
// ═══════════════════════════════════════════════════════════════

(function initPWAInstall() {
  const DISMISSED_KEY = 'limitless_pwa_dismissed';
  let deferredPrompt = null;

  function alreadyInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  if (alreadyInstalled()) return;
  if (localStorage.getItem(DISMISSED_KEY)) return;

  const banner   = document.getElementById('pwa-banner');
  const installBtn = document.getElementById('pwa-install-btn');
  const dismissBtn = document.getElementById('pwa-dismiss-btn');

  function showBanner() {
    if (!banner) return;
    banner.classList.remove('hidden');
  }

  function hideBanner(animated) {
    if (!banner) return;
    if (animated) {
      banner.classList.add('dismissing');
      setTimeout(() => banner.classList.add('hidden'), 300);
    } else {
      banner.classList.add('hidden');
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    hideBanner(true);
  }

  dismissBtn && dismissBtn.addEventListener('click', dismiss);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const tryShow = () => {
      if (document.getElementById('app-screen')?.classList.contains('active')) {
        showBanner();
      } else {
        setTimeout(tryShow, 800);
      }
    };
    setTimeout(tryShow, 1200);
  });

  installBtn && installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome === 'accepted') {
        showToast('Limitless installed ✓');
      }
      hideBanner(true);
      localStorage.setItem(DISMISSED_KEY, '1');
    }
  });

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isIOS && isSafari && !alreadyInstalled()) {
    if (installBtn) {
      installBtn.outerHTML = `<span class="pwa-ios-steps">Tap <strong>Share ↑</strong> then<br/><strong>"Add to Home Screen"</strong></span>`;
    }
    const tryShowIOS = () => {
      if (document.getElementById('app-screen')?.classList.contains('active')) {
        showBanner();
      } else {
        setTimeout(tryShowIOS, 800);
      }
    };
    setTimeout(tryShowIOS, 1500);
  }

  window.addEventListener('appinstalled', () => {
    hideBanner(true);
    localStorage.setItem(DISMISSED_KEY, '1');
    showToast('Limitless added to your home screen ✓');
  });
})();

// ═══════════════════════════════════════════════════════════════
//  QUICK-SWITCH FLOATING BUTTON
// ═══════════════════════════════════════════════════════════════

(function initQuickSwitch() {
  const fab       = document.getElementById('qs-fab');
  const fabWrap   = document.getElementById('qs-fab-wrap');
  const panel     = document.getElementById('qs-panel');
  const list      = document.getElementById('qs-list');
  const countEl   = document.getElementById('qs-fab-count');
  const backdrop  = document.getElementById('qs-backdrop');

  if (!fab || !fabWrap) return;

  let panelOpen = false;

  function updateFAB() {
    const appActive = document.getElementById('app-screen')?.classList.contains('active');
    if (!appActive) {
      fabWrap.classList.add('hidden');
      return;
    }
    fabWrap.classList.remove('hidden');

    const available = (window.state?.accounts || []).filter(
      a => !window.isOnCooldown(a)
    );

    const count = available.length;
    countEl.textContent = count;
    countEl.classList.toggle('zero', count === 0);
  }

  function buildList() {
    const available = (window.state?.accounts || []).filter(
      a => !window.isOnCooldown(a)
    );

    if (available.length === 0) {
      list.innerHTML = `<div class="qs-empty">No accounts available right now.<br/>Log a limit to start tracking.</div>`;
      return;
    }

    list.innerHTML = '';
    available.forEach((account, i) => {
      const color = (window.PLATFORM_COLORS?.[account.platform]) || '#9ca3af';
      const btn = document.createElement('button');
      btn.className = 'qs-item';
      btn.setAttribute('role', 'option');
      btn.style.animationDelay = `${i * 35}ms`;
      btn.innerHTML = `
        <span class="qs-item-dot" style="background:${color}"></span>
        <span class="qs-item-body">
          <span class="qs-item-platform">${account.platform}</span>
          <span class="qs-item-email">${account.email || '—'}</span>
        </span>
        <span class="qs-item-copy" aria-hidden="true">copy</span>
      `;
      btn.addEventListener('click', () => {
        const text = account.email || account.platform;
        navigator.clipboard.writeText(text)
          .then(() => {
            showToast(`Copied: ${text}`);
            btn.style.background = 'var(--bg-subtle)';
            setTimeout(() => btn.style.background = '', 400);
            closePanel();
          })
          .catch(() => {
            showToast(`${account.platform} · ${account.email || '—'}`);
            closePanel();
          });
      });
      list.appendChild(btn);
    });
  }

  function openPanel() {
    buildList();
    panel.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    fab.classList.add('open');
    panelOpen = true;
    updateFAB();
  }

  function closePanel() {
    panel.classList.add('hidden');
    backdrop.classList.add('hidden');
    fab.classList.remove('open');
    panelOpen = false;
  }

  function togglePanel() {
    panelOpen ? closePanel() : openPanel();
  }

  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel();
  });

  backdrop.addEventListener('click', closePanel);

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    const inField = tag === 'input' || tag === 'textarea' || tag === 'select';
    const modalOpen = !!document.querySelector('.modal-backdrop.open');
    if (inField || modalOpen) return;

    const appActive = document.getElementById('app-screen')?.classList.contains('active');
    if (!appActive) return;

    if (e.key.toLowerCase() === 'q') {
      e.preventDefault();
      togglePanel();
    }
  });

  setInterval(updateFAB, 60000);

  const waitForApp = setInterval(() => {
    const appActive = document.getElementById('app-screen')?.classList.contains('active');
    if (appActive) {
      updateFAB();
      clearInterval(waitForApp);
    }
  }, 300);
})();

// ═══════════════════════════════════════════════════════════════
//  BOOT — DOM CONTENT LOADED
// ═══════════════════════════════════════════════════════════════

// ─── GLOBAL ERROR HANDLER ──────────────────────────────────

window.onerror = function (msg, source, line, col, error) {
  console.error('Global error:', msg, 'at', source, line + ':' + col);
  const toast = document.getElementById('toast');
  if (toast && !toast.classList.contains('show')) {
    showError('Something went wrong — tap to retry');
    toast.addEventListener('click', () => location.reload(), { once: true });
  }
  return true;
};

window.onunhandledrejection = function (e) {
  console.error('Unhandled promise rejection:', e.reason);
  const toast = document.getElementById('toast');
  if (toast && !toast.classList.contains('show')) {
    showError('A background sync failed — check your connection');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  init();
  initTheme();
  initExport();
  initChatsView();
  initOnboarding();
  updateSyncBadge();

  // Session re-auth
  $('session-reauth-btn')?.addEventListener('click', () => {
    hideSessionBanner();
    showAuth();
  });

  // Timeline window toggle buttons
  document.querySelectorAll('.tl-win-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tlWindowHours = parseInt(btn.dataset.hours);
      document.querySelectorAll('.tl-win-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (state.currentView === 'timeline') renderTimeline();
    });
  });

  // Offline banner initial state
  if (!navigator.onLine) showOfflineBanner(true);

  // --- Onboarding (already called above) ---

  // --- Report nav ---
  document.getElementById('report-prev')?.addEventListener('click', () => { reportWeekOffset++; renderReport(); });
  document.getElementById('report-next')?.addEventListener('click', () => { if (reportWeekOffset > 0) { reportWeekOffset--; renderReport(); } });

  // --- Heatmap nav ---
  document.getElementById('heatmap-prev')?.addEventListener('click', () => { heatmapYearOffset--; renderHeatmap(); });
  document.getElementById('heatmap-next')?.addEventListener('click', () => { heatmapYearOffset++; renderHeatmap(); });

  // --- Rotation refresh ---
  document.getElementById('refresh-rotation')?.addEventListener('click', renderRotation);

  // --- Prompts search ---
  document.getElementById('prompts-search')?.addEventListener('input', e => { renderPrompts(e.target.value.trim()); });
  document.getElementById('add-prompt-btn')?.addEventListener('click', () => openPromptModal());
  document.getElementById('save-prompt-btn')?.addEventListener('click', handleSavePrompt);

  // --- Prompt platform chips ---
  document.querySelectorAll('#prompt-platform-chips .reason-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#prompt-platform-chips .reason-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
  });

  // --- Tags modal events ---
  document.getElementById('tags-add-btn')?.addEventListener('click', () => {
    const accountId = document.getElementById('tags-account-id').value;
    const input = document.getElementById('tags-input');
    addTag(accountId, input.value);
    input.value = '';
  });
  document.getElementById('tags-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const accountId = document.getElementById('tags-account-id').value;
      addTag(accountId, e.target.value);
      e.target.value = '';
    }
  });
  const tagsSuggested = document.getElementById('tags-suggested');
  if (tagsSuggested) {
    tagsSuggested.addEventListener('click', e => {
      const btn = e.target.closest('.tag-suggest');
      if (btn) {
        const accountId = document.getElementById('tags-account-id').value;
        addTag(accountId, btn.dataset.tag);
      }
    });
  }
  document.getElementById('save-tags-btn')?.addEventListener('click', handleSaveTags);

  // --- Group modal events ---
  document.getElementById('save-group-btn')?.addEventListener('click', handleSaveGroup);

  // --- Cost price inputs ---
  document.addEventListener('input', e => {
    if (e.target.classList.contains('cost-price-input')) {
      const platform = e.target.dataset.platform;
      const prices = loadCostPrices();
      prices[platform] = parseFloat(e.target.value) || 0;
      state.costPrices = prices;
      localStorage.setItem('limitless_cost_prices', JSON.stringify(prices));
      if (typeof setUserData === 'function') setUserData('costPrices', prices).catch(e => console.warn('Sync failed:', e));
      renderCost();
    }
  });

  // --- Messages init ---
  document.getElementById('messages-search')?.addEventListener('input', e => { renderMessages(e.target.value); });
  document.getElementById('add-message-btn')?.addEventListener('click', () => openMessageModal());
  document.getElementById('save-message-btn')?.addEventListener('click', handleSaveMessage);
  document.querySelector('#modal-message .modal-close')?.addEventListener('click', () => {
    const ci = document.getElementById('message-custom-platform');
    if (ci) { ci.style.display = 'none'; ci.value = ''; }
  });
  document.querySelector('#modal-message [data-modal="modal-message"]')?.addEventListener('click', () => {
    const ci = document.getElementById('message-custom-platform');
    if (ci) { ci.style.display = 'none'; ci.value = ''; }
  });
  document.querySelectorAll('#message-platform-chips .reason-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#message-platform-chips .reason-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const customInput = document.getElementById('message-custom-platform');
      if (chip.dataset.platform === 'Other') {
        customInput.style.display = 'block';
        customInput.focus();
      } else {
        customInput.style.display = 'none';
        customInput.value = '';
      }
    });
  });
  document.getElementById('message-prompt')?.addEventListener('input', () => updateCharCount('message-prompt', 'prompt-char-count'));
  document.getElementById('message-reply')?.addEventListener('input',  () => updateCharCount('message-reply',  'reply-char-count'));

  // --- Settings events ---
  $('save-name-btn')?.addEventListener('click', async () => {
    const name = $('settings-name-input')?.value.trim();
    if (!name) { showToast('Enter a display name'); return; }
    const btn = $('save-name-btn');
    btn.disabled = true; btn.textContent = '…';
    try {
      await updateDisplayName(name);
      $('user-name').textContent = name;
      $('settings-display-name').textContent = name;
      if ($('settings-avatar-initials')) $('settings-avatar-initials').textContent = name[0].toUpperCase();
      showSuccess('Name updated ✓');
    } catch (e) {
      showError(e.message || 'Failed to update name');
    } finally {
      btn.disabled = false; btn.textContent = 'Save';
    }
  });

  $('save-email-btn')?.addEventListener('click', async () => {
    const email = $('settings-new-email')?.value.trim();
    if (!email || !email.includes('@')) { showToast('Enter a valid email'); return; }
    const btn = $('save-email-btn');
    btn.disabled = true; btn.textContent = '…';
    try {
      await updateEmail(email);
      showSuccess('Confirmation sent to ' + email + ' ✉');
      $('settings-new-email').value = '';
    } catch (e) {
      showError(e.message || 'Failed to update email');
    } finally {
      btn.disabled = false; btn.textContent = 'Update';
    }
  });

  $('save-password-btn')?.addEventListener('click', async () => {
    const pw  = $('settings-new-password')?.value;
    const cpw = $('settings-confirm-password')?.value;
    if (!pw || pw.length < 6) { showToast('Password must be 6+ characters'); return; }
    if (pw !== cpw) { showToast('Passwords do not match'); return; }
    const btn = $('save-password-btn');
    btn.disabled = true; btn.textContent = '…';
    try {
      await updatePassword(pw);
      $('settings-new-password').value = '';
      $('settings-confirm-password').value = '';
      showSuccess('Password changed ✓');
    } catch (e) {
      showError(e.message || 'Failed to change password');
    } finally {
      btn.disabled = false; btn.textContent = 'Change';
    }
  });

  $('toggle-settings-pw')?.addEventListener('click', () => {
    const input = $('settings-new-password');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  $('send-reset-btn')?.addEventListener('click', async () => {
    const email = currentUser?.email;
    if (!email) { showToast('No email found'); return; }
    const btn = $('send-reset-btn');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await sendPasswordReset(email);
      showSuccess('Reset link sent to ' + email + ' ✉');
    } catch (e) {
      showError(e.message || 'Failed to send reset email');
    } finally {
      btn.disabled = false; btn.textContent = 'Send Link';
    }
  });

  document.querySelectorAll('[data-theme-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.themePick;
      applyTheme(theme);
      document.querySelectorAll('[data-theme-pick]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showToast(`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`);
    });
  });

  $('settings-notif-btn')?.addEventListener('click', async () => {
    if (typeof requestNotificationPermission === 'function') {
      await requestNotificationPermission();
      renderSettings();
    }
  });

  $('settings-email-toggle')?.addEventListener('click', () => {
    const current = localStorage.getItem('limitless_email_alerts');
    const next = current === 'off' ? 'on' : 'off';
    localStorage.setItem('limitless_email_alerts', next);
    $('settings-email-toggle').textContent = next === 'off' ? 'OFF' : 'ON';
    $('settings-email-toggle').className = next === 'off' ? 'btn-ghost small danger' : 'btn-ghost small';
    if (typeof setUserData === 'function') {
      setUserData('email_alerts', next === 'on').catch(e => console.warn('Sync failed:', e));
    }
    if (next === 'on' && typeof emailjs !== 'undefined') {
      emailjs.init(EMAILJS_PUBLIC_KEY);
    }
    showToast(next === 'off' ? 'Email alerts off' : 'Email alerts on');
  });

  $('settings-ritual-toggle')?.addEventListener('click', async () => {
    const cur = localStorage.getItem('limitless_ritual_widget') ?? 'off';
    const next = cur === 'off' ? 'on' : 'off';
    localStorage.setItem('limitless_ritual_widget', next);
    $('settings-ritual-toggle').textContent = next === 'off' ? 'OFF' : 'ON';
    $('settings-ritual-toggle').className = next === 'off' ? 'btn-ghost small danger' : 'btn-ghost small';
    try { await setUserData('ritual_widget_on', next === 'on'); } catch (e) { console.warn('Failed to sync ritual widget setting:', e); }
    renderRitualWidget();
    showToast(next === 'off' ? 'Ritual widget hidden' : 'Ritual widget visible');
  });

  $('settings-signout-btn')?.addEventListener('click', async () => {
    if (confirm('Sign out?')) {
      await signOut();
      _showAppGuard = false;
      state.accounts = [];
      state.projects = [];
      state.prompts = [];
      state.accountTags = {};
      state.costPrices = {};
      state.groups = [];
      state.chats = [];
      state.messages = [];
      state.notifHistory = [];
      state.streak = { streak: 0, lastLog: '', history: [] };
      showAuth();
    }
  });

  $('settings-delete-data-btn')?.addEventListener('click', async () => {
    const first = confirm('⚠ Delete ALL your accounts and projects permanently?\n\nThis cannot be undone.');
    if (!first) return;
    const second = confirm('Are you absolutely sure? All data will be gone.');
    if (!second) return;
    const btn = $('settings-delete-data-btn');
    btn.disabled = true; btn.textContent = 'Deleting…';
    try {
      await deleteAllUserData();
      state.prompts = [];
      state.accountTags = {};
      state.costPrices = {};
      state.groups = [];
      state.chats = [];
      state.notifHistory = [];
      state.streak = { streak: 0, lastLog: '', history: [] };
      clearLocalStorageSyncKeys();
      await loadAll();
      renderView();
      switchView('dashboard');
      showSuccess('All data deleted');
    } catch (e) {
      showError('Failed to delete data');
      btn.disabled = false; btn.textContent = 'Delete';
    }
  });

  // Import / Export buttons
  $('limitless-export-csv')?.addEventListener('click', exportLimitlessCSV);
  $('limitless-export-xlsx')?.addEventListener('click', exportLimitlessXLSX);
  $('limitless-import-btn')?.addEventListener('click', () => $('limitless-import-input')?.click());
  $('limitless-import-input')?.addEventListener('change', handleLimitlessImport);

  // Timeline auto-refresh
  setInterval(() => {
    if (state.currentView === 'timeline') renderTimeline();
  }, 30000);

  // Chat view init (already called via initChatsView)
  // initChatsView is defined below

  // Streak card share
  $('share-card-btn')?.addEventListener('click', shareStreakCard);
});

// ─── Chat view init ─────────────────────────────────────────

function initChatsView() {
  document.getElementById('save-chat-btn')?.addEventListener('click', handleSaveChat);
  document.getElementById('add-chat-btn')?.addEventListener('click', () => openChatModal());
  document.getElementById('empty-add-chat-btn')?.addEventListener('click', () => openChatModal());
  document.querySelectorAll('#chat-platform-chips .reason-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#chat-platform-chips .reason-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const customInput = document.getElementById('chat-custom-platform');
      if (chip.dataset.platform === 'Other') {
        customInput.style.display = 'block';
        customInput.focus();
      } else {
        customInput.style.display = 'none';
        customInput.value = '';
      }
    });
  });
  document.getElementById('chats-search')?.addEventListener('input', e => {
    renderChats(e.target.value.trim());
  });
}

// ─── Notifications bell ─────────────────────────────────────

// Expose for notifications.js
window.addNotifHistory = addNotifHistory;
window.renderNotifList = renderNotifList;
