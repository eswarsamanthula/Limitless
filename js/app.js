// ============================================================
//  LIMITLESS — MAIN APP
//  Handles all UI, state, rendering, and interactions.
// ============================================================

'use strict';

// ─── STATE ───────────────────────────────────────────────────
let state = {
  accounts: [],
  projects: [],
  currentView: 'dashboard',
  filter: 'all',
  sort: 'default',
  search: '',
  editingAccountId: null,
  editingProjectId: null,
  selectedPlatform: 'Claude',
  selectedAccountType: 'free',
  selectedColor: '#6ee7b7',
  countdownIntervals: {},
  groupFilter: null,
  // Cross-device sync caches (populated from Supabase on app start)
  prompts: [],
  accountTags: {},
  costPrices: {},
  groups: [],
  chats: [],
  notifHistory: [],
  streak: { streak: 0, lastLog: '', history: [] },
  messages: [],
};
window.state = state; // expose for FAB + other modules

// ─── DOM REFS ────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ─── GUARD: prevent showApp double-call from onAuthChange + getSession race ──
let _showAppGuard = false;

// ─── INIT ────────────────────────────────────────────────────
async function init() {
  const hasSupabase = initSupabase();

  if (!hasSupabase) {
    // Show not-configured warning on auth screen
    document.getElementById('auth-not-configured')?.classList.remove('hidden');
    document.getElementById('google-signin-btn').disabled = true;
    document.getElementById('email-action-btn').disabled = true;
    showAuth();
  } else {
    onAuthChange(async (session, event) => {
      try {
        if (!session) {
          if (event === 'SIGNED_OUT') {
            _showAppGuard = false;
            state.accounts = [];
            state.projects = [];
            showAuth();
          } else {
            showSessionBanner();
          }
          return;
        }
        hideSessionBanner();
        if (!_showAppGuard) {
          await showApp(session.user);
        }
      } catch (e) {
        console.error('Auth change error:', e);
      }
    });

    try {
      const session = await getSession();
      if (session && !_showAppGuard) {
        await showApp(session.user);
      } else if (!session) {
        showAuth();
      }
    } catch (e) {
      console.error('Session error:', e);
      showAuth();
      showWarn('Connection issue — sign in again when ready');
    }
  }

  bindUIEvents();
  startGlobalCountdownTick();
}

// ─── AUTH SCREENS ─────────────────────────────────────────────
function showAuth() {
  $('auth-screen').classList.add('active');
  $('app-screen').classList.remove('active');
}

async function showApp(user) {
  if (_showAppGuard) return;
  _showAppGuard = true;

  // Fetch fresh user profile from server (JWT metadata can be stale across devices)
  if (typeof getFreshUser === 'function') {
    try {
      const fresh = await getFreshUser();
      if (fresh) { user = fresh; currentUser = fresh; }
    } catch (_) {}
  }

  $('auth-screen').classList.remove('active');
  $('app-screen').classList.add('active');

  if (user) {
    const userNameEl = $('user-name');
    const userEmail = user.email || '';
    userNameEl.textContent = user.user_metadata?.name || user.user_metadata?.full_name || userEmail.split('@')[0] || 'User';
    const avatar = $('user-avatar');
    if (user.user_metadata?.avatar_url) {
      avatar.src = user.user_metadata.avatar_url;
      avatar.style.display = 'block';
    } else {
      avatar.style.display = 'none';
    }
    if (typeof setNotifUserEmail === 'function') setNotifUserEmail(userEmail);
  }

  await loadAll();

  // Load cross-device syncable data from Supabase into state cache
  if (typeof loadAllUserData === 'function') {
    try {
      const userData = await loadAllUserData();
      if (userData.prompts) state.prompts = userData.prompts;
      if (userData.accountTags) state.accountTags = userData.accountTags;
      if (userData.costPrices) state.costPrices = userData.costPrices;
      if (userData.groups) state.groups = userData.groups;
      if (userData.chats) state.chats = userData.chats;
      if (userData.notifHistory) state.notifHistory = userData.notifHistory;
      if (userData.streak) state.streak = userData.streak;
      if (userData.messages) { state.messages = userData.messages; saveMessages(userData.messages); }
    } catch (e) {
      console.warn('Could not load user data from server, using defaults');
    }
  }

  renderView();
  initNotifications();
  if (typeof window.initStreakUI === 'function') window.initStreakUI();
  setTimeout(() => { if (typeof updateBellState === 'function') updateBellState(); }, 100);

  // Live cross-device sync — re-fetch data when another device makes changes
  if (typeof subscribeToRealtime === 'function') {
    let _rtTimer;
    subscribeToRealtime((table) => {
      clearTimeout(_rtTimer);
      _rtTimer = setTimeout(async () => {
        showSuccess('Live sync update received');
        if (table === 'accounts' || table === 'projects') {
          await loadAll();
          renderView();
        } else if (table === 'user_data') {
          try {
            const userData = await loadAllUserData();
            if (userData.prompts) state.prompts = userData.prompts;
            if (userData.accountTags) state.accountTags = userData.accountTags;
            if (userData.costPrices) state.costPrices = userData.costPrices;
            if (userData.groups) state.groups = userData.groups;
            if (userData.chats) state.chats = userData.chats;
            if (userData.notifHistory) state.notifHistory = userData.notifHistory;
            if (userData.streak) state.streak = userData.streak;
            if (userData.messages) { state.messages = userData.messages; saveMessages(userData.messages); }
          } catch (_) {}
          renderView();
        }
      }, 500);
    });
  }
}

// ─── DATA LOADING ─────────────────────────────────────────────
async function loadAll(opts = {}) {
  const { silent = false } = opts;
  if (!silent) {
    state.loading = true;
    renderView();
  }
  try {
    const [accounts, projects] = await Promise.all([getAccounts(), getProjects()]);
    state.accounts = accounts || [];
    state.projects = projects || [];
    state.loadError = false;
  } catch (e) {
    console.error('Load error:', e);
    state.loadError = true;
    if (!navigator.onLine) {
      // offline — keep stale data silently, show banner
      showOfflineBanner(true);
    } else {
      showError('Failed to load data — tap to retry');
      $('toast')?.addEventListener('click', () => loadAll(), { once: true });
    }
  } finally {
    state.loading = false;
    renderView();
  }
}

// ─── VIEW SWITCHING ───────────────────────────────────────────
function switchView(view) {
  state.currentView = view;

  $$('.view').forEach(v => v.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.remove('active'));

  $(`view-${view}`).classList.add('active');
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');

  const titles = { dashboard: 'Dashboard', accounts: 'Accounts', projects: 'Projects', timeline: 'Timeline', chats: 'Saved Chats', compare: 'Compare Models', report: 'Weekly Report', prompts: 'Prompt Library', cost: 'Cost Tracker', heatmap: 'Limit Heatmap', rotation: 'Rotation Planner', groups: 'Account Groups', settings: 'Profile & Settings' };
  $('view-title').textContent = titles[view] || view;

  const actionLabels = { dashboard: '+ Add Account', accounts: '+ Add Account', projects: '+ Add Project', timeline: '+ Add Account', messages: '+ Save Message', chats: '+ Save Chat', compare: '', report: '', prompts: '+ Add Prompt', cost: '', heatmap: '', rotation: '', groups: '+ New Group', settings: '' };
  $('topbar-action').textContent = actionLabels[view];

  closeSidebar();
  renderView();
}

function renderView() {
  if (state.currentView === 'dashboard') renderDashboard();
  else if (state.currentView === 'accounts') renderAccountsList();
  else if (state.currentView === 'projects') renderProjectsList();
  else if (state.currentView === 'timeline') renderTimeline();
  else if (state.currentView === 'messages') renderMessages();
  else if (state.currentView === 'chats') renderChats();
  else if (state.currentView === 'compare') renderCompare();
  else if (state.currentView === 'report') renderReport();
  else if (state.currentView === 'prompts') renderPrompts();
  else if (state.currentView === 'cost') renderCost();
  else if (state.currentView === 'heatmap') renderHeatmap();
  else if (state.currentView === 'rotation') renderRotation();
  else if (state.currentView === 'groups') renderGroupsView();
  else if (state.currentView === 'settings') renderSettings();
}

// ─── DASHBOARD ────────────────────────────────────────────────
function renderDashboard() {
  const accounts = filterAccounts(state.accounts, state.filter);

  // Stats
  const total = state.accounts.length;
  const cooling = state.accounts.filter(a => isOnCooldown(a)).length;
  const available = total - cooling;

  $('stat-total').textContent = total;
  $('stat-available').textContent = available;
  $('stat-cooling').textContent = cooling;

  // Grid
  const grid = $('accounts-grid');
  // Safe-detach empty state so innerHTML wipes never destroy it
  const empty = $('empty-dashboard') || (() => {
    const el = document.createElement('div');
    el.id = 'empty-dashboard';
    el.className = 'empty-state';
    el.innerHTML = `<span class="empty-icon">◎</span><p>No accounts yet.<br/>Add your first AI account to start tracking.</p><button class="btn-primary" id="empty-add-btn" onclick="openAccountModal()">+ Add Account</button>`;
    return el;
  })();
}

// ═══════════════════════════════════════════════════════════════
//  J — PLATFORM STATS PIE CHART
// ═══════════════════════════════════════════════════════════════
function renderPlatformPie() {
  const svg = document.getElementById('platform-pie-svg');
  const legend = document.getElementById('platform-pie-legend');
  if (!svg || !legend) return;
  const counts = {};
  state.accounts.forEach(a => { counts[a.platform] = (counts[a.platform] || 0) + 1; });
  const total = state.accounts.length || 1;
  const entries = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  if (entries.length === 0) {
    legend.innerHTML = '<span style="font-size:0.75rem;color:var(--text-faint);font-style:italic">No accounts</span>';
    svg.innerHTML = '';
    return;
  }
  const colors = entries.map(([p]) => PLATFORM_COLORS[p] || '#888');
  const slices = entries.map(([,c]) => (c / total) * 360);
  const LABEL_LEN = 16;
  let cumulative = -90;
  let pieHtml = '';
  legend.innerHTML = entries.map(([p, c], i) => {
    const pct = ((c / total) * 100).toFixed(1);
    return `<div class="platform-pie-item"><span class="platform-pie-dot" style="background:${colors[i]}"></span><span class="platform-pie-name">${escHtml(p.length > LABEL_LEN ? p.slice(0,LABEL_LEN)+'…' : p)}</span><span class="platform-pie-pct">${pct}%</span></div>`;
  }).join('');
  entries.forEach(([, c], i) => {
    const angle = (c / total) * 360;
    if (angle === 0) return;
    const startAngle = cumulative;
    const endAngle = cumulative + angle;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = 50 + 42 * Math.cos(startRad);
    const y1 = 50 + 42 * Math.sin(startRad);
    const x2 = 50 + 42 * Math.cos(endRad);
    const y2 = 50 + 42 * Math.sin(endRad);
    const large = angle > 180 ? 1 : 0;
    pieHtml += `<path d="M50 50 L${x1.toFixed(1)} ${y1.toFixed(1)} A42 42 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${colors[i]}" opacity="0.8" stroke="var(--bg-card)" stroke-width="1"/>`;
    cumulative += angle;
  });
  svg.innerHTML = pieHtml + `<circle cx="50" cy="50" r="28" fill="var(--bg-card)" opacity="0.95"/><text x="50" y="50" text-anchor="middle" dominant-baseline="central" fill="var(--text)" font-family="var(--font-mono)" font-size="14" font-weight="600">${total}</text>`;
}

// ═══════════════════════════════════════════════════════════════
//  K — HEALTH SCORE RING
// ═══════════════════════════════════════════════════════════════
function renderHealthRing() {
  const svg = document.getElementById('health-ring-svg');
  const scoreEl = document.getElementById('health-score');
  const subEl = document.getElementById('health-sub');
  if (!svg || !scoreEl) return;
  const total = state.accounts.length;
  if (total === 0) {
    scoreEl.textContent = '—';
    subEl.textContent = 'No accounts';
    svg.innerHTML = '';
    return;
  }
  const available = state.accounts.filter(a => !isOnCooldown(a)).length;
  const pct = Math.round((available / total) * 100);
  const radius = 34;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
  svg.innerHTML = `
    <circle cx="40" cy="40" r="${radius}" fill="none" stroke="var(--bg-subtle)" stroke-width="5"/>
    <circle cx="40" cy="40" r="${radius}" fill="none" stroke="${color}" stroke-width="5"
      stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round"
      transform="rotate(-90 40 40)" style="transition: stroke-dashoffset 0.8s ease"/>
    <text x="40" y="40" text-anchor="middle" dominant-baseline="central"
      fill="var(--text)" font-family="var(--font-display)" font-size="22" font-weight="400">${pct}%</text>`;
  scoreEl.textContent = `${available}/${total}`;
  subEl.textContent = pct >= 80 ? 'Great shape' : pct >= 50 ? 'Some cooldowns' : 'Heavy usage';
}

// ═══════════════════════════════════════════════════════════════
//  X — LIMIT REASON ANALYTICS
// ═══════════════════════════════════════════════════════════════
function renderReasonAnalytics() {
  const container = document.getElementById('reason-bars');
  if (!container) return;
  const reasons = {};
  let noReason = 0;
  const totalLimits = state.accounts.filter(a => a.limit_hit_at).length;
  state.accounts.forEach(a => {
    if (!a.limit_hit_at) return;
    if (a.limit_note) reasons[a.limit_note] = (reasons[a.limit_note] || 0) + 1;
    else noReason++;
  });
  if (noReason) reasons['No reason'] = noReason;
  const entries = Object.entries(reasons).sort((a,b) => b[1] - a[1]);
  if (entries.length === 0) {
    container.innerHTML = '<span style="font-size:0.75rem;color:var(--text-faint);font-style:italic">No limit data yet</span>';
    return;
  }
  const maxCount = entries[0][1];
  const ICONS = { Message:'💬', Image:'🖼', Code:'⌨', Search:'🔍' };
  container.innerHTML = `<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.5rem;font-weight:600">${totalLimits} limit${totalLimits!==1?'s':''} hit</div>` + entries.map(([reason, count]) => {
    const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
    const color = reason === 'Message' ? '#93c5fd' : reason === 'Image' ? '#fca5a5' : reason === 'Code' ? '#6ee7b7' : reason === 'Search' ? '#fcd34d' : '#c4b5fd';
    return `<div class="reason-bar-row">
      <span class="reason-bar-icon">${ICONS[reason] || '📝'}</span>
      <span class="reason-bar-label">${escHtml(reason)}</span>
      <div class="reason-bar-track"><div class="reason-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <span class="reason-bar-count">${count}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
//  L — SMART SUGGESTIONS
// ═══════════════════════════════════════════════════════════════
function renderSmartSuggestion() {
  const el = document.getElementById('dash-suggest');
  if (!el) return;
  const available = state.accounts.filter(a => !isOnCooldown(a));
  if (available.length === 0) { el.classList.add('hidden'); return; }
  const sorted = [...available].sort((a, b) => {
    const aReset = a.reset_at ? new Date(a.reset_at) : new Date(0);
    const bReset = b.reset_at ? new Date(b.reset_at) : new Date(0);
    return aReset - bReset;
  });
  const best = sorted[0];
  const color = PLATFORM_COLORS[best.platform] || '#888';
  const recentlyUsed = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  let suggestion = `<strong>${escHtml(best.platform)}</strong> — ${escHtml(best.email || '—')} is available now`;
  if (recentlyUsed && recentlyUsed.id !== best.id) {
    suggestion += `. Try it after ${escHtml(recentlyUsed.platform)}.`;
  }
  el.classList.remove('hidden');
  el.innerHTML = `<div class="smart-suggest-header"><span class="smart-suggest-icon">✦</span><span class="smart-suggest-title">Suggestion</span><button class="smart-suggest-dismiss" id="suggest-dismiss" aria-label="Dismiss">✕</button></div><div class="smart-suggest-body">${suggestion}</div>`;
  el.style.borderLeftColor = color;
  clearTimeout(el._dismissTimer);
  el._dismissTimer = setTimeout(() => el.classList.add('hidden'), 15000);
  const dismissBtn = el.querySelector('#suggest-dismiss');
  if (dismissBtn) {
    dismissBtn.onclick = (e) => { e.stopPropagation(); el.classList.add('hidden'); clearTimeout(el._dismissTimer); };
  }
}

// ═══════════════════════════════════════════════════════════════
//  T — LIMIT PREDICTION (on dashboard cards)
//  Appended to card rendering via buildAccountCard override wrapper
// ═══════════════════════════════════════════════════════════════
function addPredictionToCard(card, account) {
  if (!account.limit_hit_at || !account.reset_at) return;
  const hitTime = new Date(account.limit_hit_at).getTime();
  const resetTime = new Date(account.reset_at).getTime();
  if (hitTime <= 0 || resetTime <= 0) return;
  const duration = resetTime - hitTime;
  if (duration <= 0) return;
  if (isOnCooldown(account)) return; // only on available cards
  const elapsed = Date.now() - resetTime;
  if (elapsed <= 0) return;
  const pct = Math.min(100, Math.round((elapsed / duration) * 100));
  const remainingPct = 100 - pct;
  const badge = document.createElement('span');
  badge.className = 'prediction-badge' + (remainingPct < 20 ? ' soon' : remainingPct < 50 ? ' warn' : '');
  badge.textContent = `~${remainingPct}% until next limit`;
  const cardActions = card.querySelector('.card-actions');
  if (cardActions) cardActions.parentNode.insertBefore(badge, cardActions);
}

// ═══════════════════════════════════════════════════════════════
//  U — SYNC BADGE
// ═══════════════════════════════════════════════════════════════
let _lastSyncTime = null;
function updateSyncBadge() {
  const el = document.getElementById('sync-badge');
  const text = document.getElementById('sync-text');
  if (!el || !text) return;
  _lastSyncTime = new Date();
  el.classList.remove('syncing');
  text.textContent = 'Synced';
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

// ═══════════════════════════════════════════════════════════════
//  A — ONBOARDING FLOW
// ═══════════════════════════════════════════════════════════════
function initOnboarding() {
  const done = localStorage.getItem('limitless_onboarding_done');
  if (done) return;
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  let currentStep = 0;
  const totalSteps = 4;
  function goToStep(n) {
    document.querySelectorAll('.onboarding-step').forEach(s => s.classList.add('hidden'));
    const step = document.querySelector(`.onboarding-step[data-step="${n}"]`);
    if (step) step.classList.remove('hidden');
    document.querySelectorAll('.onb-dot').forEach((d, i) => d.classList.toggle('active', i === n));
    currentStep = n;
  }
  document.querySelectorAll('.onboarding-next').forEach(btn => {
    btn.addEventListener('click', () => goToStep(Math.min(currentStep + 1, totalSteps - 1)));
  });
  document.querySelector('.onboarding-finish')?.addEventListener('click', () => {
    overlay.classList.add('hidden');
    localStorage.setItem('limitless_onboarding_done', '1');
  });
  document.getElementById('onboarding-skip')?.addEventListener('click', () => {
    overlay.classList.add('hidden');
    localStorage.setItem('limitless_onboarding_done', '1');
  });
}

// ═══════════════════════════════════════════════════════════════
//  M — PROMPT LIBRARY
// ═══════════════════════════════════════════════════════════════
  function loadPrompts() {
    if (state.prompts.length) return state.prompts;
    try { return JSON.parse(localStorage.getItem('limitless_prompts') || '[]'); }
    catch { return []; }
  }
  function savePrompts(prompts) {
    state.prompts = prompts;
    localStorage.setItem('limitless_prompts', JSON.stringify(prompts));
    if (typeof setUserData === 'function') setUserData('prompts', prompts).catch(() => {});
  }

function renderPrompts(query = '') {
  const list = document.getElementById('prompts-list');
  if (!list) return;
  list.innerHTML = '';
  let prompts = loadPrompts();
  if (query) {
    const q = query.toLowerCase();
    prompts = prompts.filter(p => (p.title||'').toLowerCase().includes(q) || (p.text||'').toLowerCase().includes(q) || (p.tag||'').toLowerCase().includes(q));
  }
  if (prompts.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">✎</span><p>${query ? 'No prompts match your search.' : 'No prompts saved yet.'}</p>${!query ? '<button class="btn-primary" onclick="openPromptModal()">+ Add Prompt</button>' : ''}</div>`;
    return;
  }
  prompts.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'prompt-card';
    card.style.animationDelay = `${i * 30}ms`;
    card.innerHTML = `
      <div class="prompt-card-top">
        <span class="prompt-card-title">${escHtml(p.title || 'Untitled')}</span>
        <span class="prompt-card-platform">${escHtml(p.platform || 'Any')}</span>
      </div>
      <div class="prompt-card-text">${escHtml(p.text || '')}</div>
      <div class="prompt-card-bottom">
        <span class="prompt-card-tag">${escHtml(p.tag || 'general')}</span>
        <div class="prompt-card-actions">
          <button onclick="event.stopPropagation();copyPrompt('${p.id}')">Copy</button>
          <button onclick="event.stopPropagation();openPromptModal('${p.id}')">Edit</button>
          <button class="danger" onclick="event.stopPropagation();deletePrompt('${p.id}')">Delete</button>
        </div>
      </div>`;
    card.addEventListener('click', () => copyPromptById(p));
    list.appendChild(card);
  });
}
function copyPromptById(prompt) {
  navigator.clipboard.writeText(prompt.text || '').then(() => showToast('Prompt copied ✎')).catch(() => showToast('Could not copy'));
}
function copyPrompt(id) {
  const prompt = loadPrompts().find(p => p.id === id);
  if (prompt) copyPromptById(prompt);
}
function deletePrompt(id) {
  const prompts = loadPrompts().filter(p => p.id !== id);
  savePrompts(prompts);
  renderPrompts(document.getElementById('prompts-search')?.value || '');
  showToast('Prompt deleted');
}
function openPromptModal(id) {
  const prompts = loadPrompts();
  const p = id ? prompts.find(x => x.id === id) : null;
  document.getElementById('prompt-id').value = id || '';
  document.getElementById('prompt-title').value = p?.title || '';
  document.getElementById('prompt-text').value = p?.text || '';
  document.getElementById('prompt-tag').value = p?.tag || '';
  const platform = p?.platform || 'Any';
  document.querySelectorAll('#prompt-platform-chips .reason-chip').forEach(c => c.classList.toggle('selected', c.dataset.platform === platform));
  document.getElementById('modal-prompt-title').textContent = id ? 'Edit Prompt' : 'Save Prompt';
  openModal('modal-prompt');
}
function handleSavePrompt() {
  const id = document.getElementById('prompt-id').value;
  const title = document.getElementById('prompt-title').value.trim();
  const text = document.getElementById('prompt-text').value.trim();
  const tag = document.getElementById('prompt-tag').value.trim() || 'general';
  const platform = document.querySelector('#prompt-platform-chips .reason-chip.selected')?.dataset.platform || 'Any';
  if (!title) { showToast('Please enter a title'); return; }
  if (!text) { showToast('Please enter a prompt'); return; }
  const prompts = loadPrompts();
  if (id) {
    const idx = prompts.findIndex(x => x.id === id);
    if (idx >= 0) prompts[idx] = { ...prompts[idx], title, text, tag, platform };
  } else {
    prompts.unshift({ id: Date.now().toString(), title, text, tag, platform, created_at: new Date().toISOString() });
  }
  savePrompts(prompts);
  closeModal('modal-prompt');
  renderPrompts();
  showToast(id ? 'Prompt updated ✎' : 'Prompt saved ✎');
}

// ═══════════════════════════════════════════════════════════════
//  B — BULK IMPORT
// ═══════════════════════════════════════════════════════════════
function openBulkModal() {
  document.getElementById('bulk-textarea').value = '';
  document.getElementById('bulk-preview').classList.add('hidden');
  openModal('modal-bulk');
}
async function handleBulkImport() {
  const text = document.getElementById('bulk-textarea').value.trim();
  if (!text) { showToast('Paste some accounts first'); return; }
  const lines = text.split('\n').filter(l => l.trim());
  let imported = 0;
  for (const line of lines) {
    const parts = line.split(',').map(s => s.trim());
    if (parts.length < 2) continue;
    const platform = parts[0];
    const email = parts[1];
    const type = (parts[2] || 'free').toLowerCase() === 'pro' ? 'pro' : 'free';
    try {
      await saveAccount({ platform, email, account_type: type, project_ids: [], note: null });
      imported++;
    } catch (e) { console.warn('Bulk import failed for:', line, e); }
  }
  if (imported > 0) {
    await loadAll();
    renderView();
    showToast(`Imported ${imported} account${imported !== 1 ? 's' : ''} ✓`);
    closeModal('modal-bulk');
  } else {
    showToast('No valid accounts found');
  }
}
function previewBulkImport() {
  const text = document.getElementById('bulk-textarea').value.trim();
  const preview = document.getElementById('bulk-preview');
  if (!text) { preview.classList.add('hidden'); return; }
  const lines = text.split('\n').filter(l => l.trim());
  preview.classList.remove('hidden');
  preview.textContent = `Detected ${lines.length} line${lines.length !== 1 ? 's' : ''}`;
}

// ═══════════════════════════════════════════════════════════════
//  W — TAGS / CUSTOM LABELS
// ═══════════════════════════════════════════════════════════════
function openTagsModal(accountId) {
  document.getElementById('tags-account-id').value = accountId;
  renderTagsCurrent(accountId);
  document.getElementById('tags-input').value = '';
  openModal('modal-tags');
}
function renderTagsCurrent(accountId) {
  const container = document.getElementById('tags-current');
  const tags = getAccountTags(accountId);
  if (tags.length === 0) {
    container.innerHTML = '<span class="checklist-empty">No tags yet</span>';
    return;
  }
  container.innerHTML = tags.map(t => `<span class="tag-chip">${escHtml(t)}<button class="tag-remove" onclick="removeTag('${accountId}','${escHtml(t)}')">✕</button></span>`).join('');
}
function _allTags() {
  if (Object.keys(state.accountTags).length) return state.accountTags;
  try { return JSON.parse(localStorage.getItem('limitless_account_tags') || '{}'); }
  catch { return {}; }
}
function getAccountTags(accountId) {
  return _allTags()[accountId] || [];
}
function saveAccountTags(accountId, tags) {
  const all = { ..._allTags(), [accountId]: tags };
  state.accountTags = all;
  localStorage.setItem('limitless_account_tags', JSON.stringify(all));
  if (typeof setUserData === 'function') setUserData('accountTags', all).catch(() => {});
}
function addTag(accountId, tag) {
  if (!tag || !tag.trim()) return;
  const tags = getAccountTags(accountId);
  if (tags.includes(tag.trim())) { showToast('Tag already exists'); return; }
  tags.push(tag.trim());
  saveAccountTags(accountId, tags);
  renderTagsCurrent(accountId);
}
function removeTag(accountId, tag) {
  let tags = getAccountTags(accountId);
  tags = tags.filter(t => t !== tag);
  saveAccountTags(accountId, tags);
  renderTagsCurrent(accountId);
}
function renderTagsOnCard(card, accountId) {
  const tags = getAccountTags(accountId);
  if (tags.length === 0) return;
  const tagsEl = document.createElement('div');
  tagsEl.className = 'card-tags';
  tagsEl.innerHTML = tags.map(t => `<span class="tag-chip">${escHtml(t)}</span>`).join('');
  const emailEl = card.querySelector('.card-email');
  if (emailEl) emailEl.parentNode.insertBefore(tagsEl, emailEl.nextSibling);
}
function handleSaveTags() {
  const accountId = document.getElementById('tags-account-id').value;
  closeModal('modal-tags');
  renderView();
  showToast('Tags saved');
}
// Wire tag suggestions
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('tags-suggested');
  if (container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('.tag-suggest');
      if (btn) {
        const accountId = document.getElementById('tags-account-id').value;
        addTag(accountId, btn.dataset.tag);
      }
    });
  }
  const addBtn = document.getElementById('tags-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const accountId = document.getElementById('tags-account-id').value;
      const input = document.getElementById('tags-input');
      addTag(accountId, input.value);
      input.value = '';
    });
  }
  const tagsInput = document.getElementById('tags-input');
  if (tagsInput) {
    tagsInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const accountId = document.getElementById('tags-account-id').value;
        addTag(accountId, tagsInput.value);
        tagsInput.value = '';
      }
    });
  }
  document.getElementById('save-tags-btn')?.addEventListener('click', handleSaveTags);
});

// ═══════════════════════════════════════════════════════════════
//  S — WEEKLY REPORT CARD
// ═══════════════════════════════════════════════════════════════
let reportWeekOffset = 0;
function renderReport() {
  const content = document.getElementById('report-content');
  if (!content) return;
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1) - reportWeekOffset * 7);
  startOfWeek.setHours(0,0,0,0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23,59,59,999);
  document.getElementById('report-week-badge').textContent = `Week ${getWeekNumber(startOfWeek)}, ${startOfWeek.toLocaleDateString([],{month:'short',day:'numeric'})} - ${endOfWeek.toLocaleDateString([],{month:'short',day:'numeric'})}`;
  if (state.accounts.length === 0) {
    content.innerHTML = '<div class="report-empty">Add some accounts and log limits to see your weekly report.</div>';
    return;
  }
  const coolingAccounts = state.accounts.filter(a => a.reset_at && new Date(a.reset_at) > startOfWeek);
  const limitsHit = state.accounts.filter(a => a.limit_hit_at && new Date(a.limit_hit_at) >= startOfWeek && new Date(a.limit_hit_at) <= endOfWeek).length;
  const platformsUsed = new Set(state.accounts.map(a => a.platform)).size;
  const days = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    days[d.toISOString().slice(0,10)] = 0;
  }
  state.accounts.forEach(a => {
    if (a.limit_hit_at) {
      const d = new Date(a.limit_hit_at).toISOString().slice(0,10);
      if (days[d] !== undefined) days[d]++;
    }
  });
  const maxDay = Math.max(1, ...Object.values(days));
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dayBars = Object.entries(days).map(([date, count], i) => {
    const pct = (count / maxDay) * 100;
    const barClass = count >= Math.ceil(maxDay * 0.7) ? 'high' : '';
    return `<div class="report-day-bar-wrap"><div class="report-day-bar ${barClass}" style="height:${Math.max(4, pct)}%" title="${date}: ${count} limit${count !== 1 ? 's' : ''}"></div><span class="report-day-label">${dayNames[i]}</span></div>`;
  }).join('');
  const platformRows = Object.entries(state.accounts.reduce((acc, a) => { acc[a.platform] = (acc[a.platform] || 0) + 1; return acc; }, {})).map(([p, c]) => {
    const color = PLATFORM_COLORS[p] || '#888';
    return `<div class="report-platform-row"><span class="report-pl-dot" style="background:${color}"></span><span class="report-pl-name">${escHtml(p)}</span><span class="report-pl-count">${c} account${c !== 1 ? 's' : ''}</span></div>`;
  }).join('');
  const coolingNow = state.accounts.filter(a => isOnCooldown(a)).length;
  content.innerHTML = `
    <div class="report-summary-cards">
      <div class="report-mini-card"><div class="report-mini-val">${limitsHit}</div><div class="report-mini-label">Limits Hit</div></div>
      <div class="report-mini-card"><div class="report-mini-val">${platformsUsed}</div><div class="report-mini-label">Platforms</div></div>
      <div class="report-mini-card"><div class="report-mini-val">${coolingNow}</div><div class="report-mini-label">On Cooldown</div></div>
      <div class="report-mini-card"><div class="report-mini-val">${state.accounts.length}</div><div class="report-mini-label">Total Accounts</div></div>
    </div>
    <div class="report-platforms">
      <div class="report-platform-title">Limit Activity This Week</div>
      <div class="report-day-chart">${dayBars}</div>
    </div>
    <div class="report-platforms">
      <div class="report-platform-title">Platform Breakdown</div>
      ${platformRows}
    </div>`;
}
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ═══════════════════════════════════════════════════════════════
//  P — COST TRACKER
// ═══════════════════════════════════════════════════════════════
function renderCost() {
  const totalEl = document.getElementById('cost-total');
  const freeEl = document.getElementById('cost-free-count');
  const proEl = document.getElementById('cost-pro-count');
  const breakdown = document.getElementById('cost-breakdown');
  if (!totalEl) return;
  const proAccounts = state.accounts.filter(a => a.account_type === 'pro');
  const freeAccounts = state.accounts.filter(a => a.account_type !== 'pro');
  const prices = loadCostPrices();
  let total = 0;
  const platCosts = {};
  state.accounts.forEach(a => {
    if (a.account_type === 'pro') {
      const cost = prices[a.platform] || 20;
      platCosts[a.platform] = (platCosts[a.platform] || 0) + cost;
      total += cost;
    }
  });
  totalEl.textContent = `$${total}`;
  freeEl.textContent = freeAccounts.length;
  proEl.textContent = proAccounts.length;
  if (proAccounts.length === 0) {
    breakdown.innerHTML = '<div class="report-empty" style="padding:1rem">No pro accounts yet</div>';
  } else {
    breakdown.innerHTML = Object.entries(platCosts).map(([plat, cost]) => {
      const color = PLATFORM_COLORS[plat] || '#888';
      const count = proAccounts.filter(a => a.platform === plat).length;
      return `<div class="cost-row"><span class="cost-row-dot" style="background:${color}"></span><span class="cost-row-name">${escHtml(plat)}</span><span class="cost-row-type">${count} pro</span><span class="cost-row-amt">$${cost}</span></div>`;
    }).join('');
  }
  renderCostEditGrid(prices);
}
const DEFAULT_PRICES = { Claude: 20, ChatGPT: 20, Gemini: 19.99, Grok: 16, Copilot: 20, Other: 15 };
function loadCostPrices() {
  if (Object.keys(state.costPrices).length) return state.costPrices;
  try { return JSON.parse(localStorage.getItem('limitless_cost_prices') || '{}'); }
  catch { return {}; }
}
function renderCostEditGrid(prices) {
  const grid = document.getElementById('cost-edit-grid');
  if (!grid) return;
  const allPlatforms = [...new Set([...state.accounts.filter(a => a.account_type === 'pro').map(a => a.platform), ...Object.keys(DEFAULT_PRICES)])];
  grid.innerHTML = allPlatforms.map(p => `
    <div class="cost-edit-field">
      <label>${escHtml(p)}</label>
      <input type="number" class="cost-price-input" data-platform="${escHtml(p)}" value="${prices[p] || DEFAULT_PRICES[p] || 20}" min="0" step="0.01" />
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════════
//  Q — LIMIT HEATMAP
// ═══════════════════════════════════════════════════════════════
let heatmapYearOffset = 0;
function renderHeatmap() {
  const content = document.getElementById('heatmap-content');
  if (!content) return;
  const year = new Date().getFullYear() + heatmapYearOffset;
  document.getElementById('heatmap-year').textContent = year;
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);
  const dayCounts = {};
  state.accounts.forEach(a => {
    if (a.limit_hit_at) {
      const d = new Date(a.limit_hit_at).toISOString().slice(0,10);
      dayCounts[d] = (dayCounts[d] || 0) + 1;
    }
  });
  const dates = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }
  const maxCount = Math.max(1, ...Object.values(dayCounts));
  if (dates.length === 0 || Object.keys(dayCounts).length === 0) {
    content.innerHTML = '<div class="empty-state"><span class="empty-icon">▦</span><p>Not enough data yet.<br/>Log some limits to see your heatmap.</p></div>';
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';
  const monthLabels = document.createElement('div');
  monthLabels.className = 'heatmap-month-labels';
  let currentMonth = -1;
  dates.forEach(d => {
    const ds = d.toISOString().slice(0,10);
    const count = dayCounts[ds] || 0;
    const level = count === 0 ? 0 : Math.min(5, Math.ceil((count / maxCount) * 5));
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.dataset.level = level;
    cell.title = `${ds}: ${count} limit${count !== 1 ? 's' : ''}`;
    grid.appendChild(cell);
    if (d.getMonth() !== currentMonth) {
      currentMonth = d.getMonth();
      const label = document.createElement('span');
      label.className = 'heatmap-month-label';
      label.textContent = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][currentMonth];
      monthLabels.appendChild(label);
    }
  });
  content.innerHTML = '';
  content.appendChild(monthLabels);
  content.appendChild(grid);
  content.innerHTML += `<div class="heatmap-legend">Less <span class="heatmap-legend-swatch l0"></span><span class="heatmap-legend-swatch l1"></span><span class="heatmap-legend-swatch l2"></span><span class="heatmap-legend-swatch l3"></span><span class="heatmap-legend-swatch l4"></span><span class="heatmap-legend-swatch l5"></span> More</div>`;
}

// ═══════════════════════════════════════════════════════════════
//  C — ACCOUNT GROUPS
// ═══════════════════════════════════════════════════════════════
function loadGroups() {
  if (state.groups.length) return state.groups;
  try { return JSON.parse(localStorage.getItem('limitless_groups') || '[]'); }
  catch { return []; }
}
function saveGroups(groups) {
  state.groups = groups;
  localStorage.setItem('limitless_groups', JSON.stringify(groups));
  if (typeof setUserData === 'function') setUserData('groups', groups).catch(() => {});
}

function renderGroupsView() {
  const list = document.getElementById('groups-list');
  if (!list) return;
  const groups = loadGroups();
  if (groups.length === 0) {
    list.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span class="empty-icon">◈</span><p>No groups yet.<br/>Create groups to organize your accounts by purpose.</p><button class="btn-primary" onclick="openGroupModal()">+ New Group</button></div>';
    return;
  }
  list.innerHTML = groups.map(g => {
    const count = state.accounts.filter(a => (a.group_ids || []).includes(g.id)).length;
    return `<div class="group-card" style="--grp-color:${g.color || '#6ee7b7'}" onclick="filterByGroup('${g.id}')"><div class="group-card-name">${escHtml(g.name)}</div><div class="group-card-count">${count} account${count !== 1 ? 's' : ''}</div></div>`;
  }).join('');
}
function openGroupModal(id) {
  const groups = loadGroups();
  const g = id ? groups.find(x => x.id === id) : null;
  document.getElementById('group-id').value = id || '';
  document.getElementById('group-name').value = g?.name || '';
  const color = g?.color || '#6ee7b7';
  document.querySelectorAll('#group-color-picker .color-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === color));
  document.getElementById('modal-group-title').textContent = id ? 'Edit Group' : 'Account Group';
  openModal('modal-group');
}
function handleSaveGroup() {
  const id = document.getElementById('group-id').value;
  const name = document.getElementById('group-name').value.trim();
  if (!name) { showToast('Please enter a group name'); return; }
  const color = document.querySelector('#group-color-picker .color-swatch.active')?.dataset.color || '#6ee7b7';
  const groups = loadGroups();
  if (id) {
    const idx = groups.findIndex(g => g.id === id);
    if (idx >= 0) groups[idx] = { ...groups[idx], name, color };
  } else {
    groups.push({ id: Date.now().toString(), name, color, account_ids: [] });
  }
  saveGroups(groups);
  closeModal('modal-group');
  if (state.currentView === 'groups') renderGroupsView();
  showToast(id ? 'Group updated' : 'Group created');
}
function filterByGroup(groupId) {
  state.groupFilter = groupId;
  state.filter = 'all';
  const groups = loadGroups();
  const group = groups.find(g => g.id === groupId);
  switchView('dashboard');
  showToast(`Showing: ${group ? escHtml(group.name) : 'Group'}`);
  // Reset active filter buttons
  $$('.filter-btn').forEach(b => b.classList.remove('active'));
  const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
  if (allBtn) allBtn.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════
//  R — ROTATION PLANNER
// ═══════════════════════════════════════════════════════════════
function renderRotation() {
  const list = document.getElementById('rotation-list');
  if (!list) return;
  const available = state.accounts.filter(a => !isOnCooldown(a));
  if (available.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="empty-icon">↻</span><p>No accounts available right now.<br/>Log some limits to start planning rotation.</p></div>';
    return;
  }
  const sorted = [...available].sort((a, b) => {
    const aReset = a.reset_at ? new Date(a.reset_at) : new Date(0);
    const bReset = b.reset_at ? new Date(b.reset_at) : new Date(0);
    return aReset - bReset;
  });
  list.innerHTML = sorted.map((a, i) => {
    const color = PLATFORM_COLORS[a.platform] || '#888';
    const tags = getAccountTags(a.id);
    const tagHtml = tags.length ? ' · ' + tags.map(t => `<span class="tag" style="font-size:0.55rem;background:var(--bg-subtle);color:var(--text-faint);border:1px solid var(--border);text-transform:none;letter-spacing:0;padding:0.1rem 0.4rem">${escHtml(t)}</span>`).join(' ') : '';
    return `<div class="rotation-item" style="--rot-color:${color}">
      <span class="rotation-order">${i + 1}</span>
      <div class="rotation-info">
        <div class="rotation-platform">${escHtml(a.platform)}</div>
        <div class="rotation-email">${escHtml(a.email || '—')}${tagHtml}</div>
      </div>
      <span class="rotation-status">${a.account_type === 'pro' ? '<span class="tag pro">PRO</span>' : '<span class="tag free">FREE</span>'}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
//  INIT ALL NEW FEATURES
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Onboarding
  initOnboarding();
  // Sync badge initial state
  updateSyncBadge();

  // --- Report nav ---
  document.getElementById('report-prev')?.addEventListener('click', () => { reportWeekOffset++; renderReport(); });
  document.getElementById('report-next')?.addEventListener('click', () => { if (reportWeekOffset > 0) { reportWeekOffset--; renderReport(); } });

  // --- Heatmap nav ---
  document.getElementById('heatmap-prev')?.addEventListener('click', () => { heatmapYearOffset--; renderHeatmap(); });
  document.getElementById('heatmap-next')?.addEventListener('click', () => { heatmapYearOffset++; renderHeatmap(); });

  // --- Rotation refresh ---
  document.getElementById('rotation-refresh')?.addEventListener('click', renderRotation);

  // --- Groups ---
  document.getElementById('add-group-btn')?.addEventListener('click', () => openGroupModal());
  document.getElementById('save-group-btn')?.addEventListener('click', handleSaveGroup);

  // --- Prompts ---
  document.getElementById('add-prompt-btn')?.addEventListener('click', () => openPromptModal());
  document.getElementById('save-prompt-btn')?.addEventListener('click', handleSavePrompt);
  document.getElementById('prompts-search')?.addEventListener('input', e => renderPrompts(e.target.value.trim()));

  // --- Prompt platform chips ---
  document.querySelectorAll('#prompt-platform-chips .reason-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#prompt-platform-chips .reason-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
  });

  // --- Cost ---
  document.getElementById('cost-edit-btn')?.addEventListener('click', () => {
    const area = document.getElementById('cost-edit-area');
    area.classList.toggle('hidden');
    if (!area.classList.contains('hidden')) renderCostEditGrid(loadCostPrices());
  });
  document.getElementById('cost-save-btn')?.addEventListener('click', () => {
    const prices = {};
    document.querySelectorAll('.cost-price-input').forEach(inp => {
      prices[inp.dataset.platform] = parseFloat(inp.value) || 0;
    });
    state.costPrices = prices;
    localStorage.setItem('limitless_cost_prices', JSON.stringify(prices));
    if (typeof setUserData === 'function') setUserData('costPrices', prices).catch(() => {});
    document.getElementById('cost-edit-area').classList.add('hidden');
    renderCost();
    showToast('Prices saved');
  });

  // --- Bulk import ---
  document.getElementById('bulk-textarea')?.addEventListener('input', previewBulkImport);
  document.getElementById('bulk-import-btn')?.addEventListener('click', handleBulkImport);

  document.getElementById('accounts-empty-add-btn')?.addEventListener('click', openAccountModal);
});

// Patch renderDashboard to add widgets
const __origRenderDashboard = renderDashboard;
renderDashboard = function() {
  __origRenderDashboard.call(this);

  // Group filter badge
  let badge = $('group-filter-badge');
  if (state.groupFilter) {
    const groups = loadGroups();
    const group = groups.find(g => g.id === state.groupFilter);
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'group-filter-badge';
      badge.style.cssText = 'display:inline-flex;align-items:center;gap:0.3rem;font-size:0.7rem;padding:0.2rem 0.5rem;border-radius:20px;background:var(--bg-card);border:1px solid var(--border);color:var(--text-muted);cursor:pointer';
      const filterRow = document.querySelector('.filter-row');
      if (filterRow) filterRow.after(badge);
    }
    badge.innerHTML = `◈ ${escHtml(group ? group.name : 'Group')} <span style="opacity:0.5">✕</span>`;
    badge.onclick = () => { state.groupFilter = null; $$('.filter-btn').forEach(b => b.classList.remove('active')); const a = document.querySelector('.filter-btn[data-filter="all"]'); if (a) a.classList.add('active'); state.filter = 'all'; renderDashboard(); };
  } else if (badge) {
    badge.remove();
  }

  const accounts = filterAccounts(state.accounts, state.filter);
  const grid = $('accounts-grid');
  if (!grid) return;

  const empty = $('empty-dashboard');
  if (empty && empty.parentNode) empty.parentNode.removeChild(empty);

  if (state.accounts.length === 0 && grid) {
    grid.innerHTML = '';
    if (empty) { grid.appendChild(empty); empty.style.display = 'flex'; }
    renderPlatformPie(); renderHealthRing(); renderReasonAnalytics(); renderSmartSuggestion();
    return;
  }

  if (!state.loading && grid) {
    grid.innerHTML = '';
    accounts.forEach((account, i) => {
      const card = buildAccountCard(account, i);
      grid.appendChild(card);
    });
  }

  renderPlatformPie();
  renderHealthRing();
  renderReasonAnalytics();
  renderSmartSuggestion();

  document.querySelectorAll('.account-card').forEach(card => {
    const accountId = card.dataset.accountId;
    if (accountId) {
      const account = state.accounts.find(a => a.id === accountId);
      if (account) {
        addPredictionToCard(card, account);
        renderTagsOnCard(card, accountId);
      }
    }
  });
};

function filterAccounts(accounts, filter) {
  let result = accounts;
  // Group filter
  if (state.groupFilter) {
    result = result.filter(a => (a.group_ids || []).includes(state.groupFilter));
  }
  // Status filter
  if (filter === 'available') result = result.filter(a => !isOnCooldown(a));
  else if (filter === 'cooldown') result = result.filter(a => isOnCooldown(a));
  // Search filter
  if (state.search) {
    const q = state.search.toLowerCase();
    result = result.filter(a =>
      (a.email || '').toLowerCase().includes(q) ||
      (a.platform || '').toLowerCase().includes(q)
    );
  }
  // Sort
  if (state.sort === 'platform') {
    result = [...result].sort((a, b) => (a.platform || '').localeCompare(b.platform || ''));
  } else if (state.sort === 'status') {
    result = [...result].sort((a, b) => {
      const ac = isOnCooldown(a) ? 1 : 0;
      const bc = isOnCooldown(b) ? 1 : 0;
      return ac - bc; // available first
    });
  } else if (state.sort === 'last_used') {
    result = [...result].sort((a, b) => {
      const ad = a.reset_at ? new Date(a.reset_at) : new Date(0);
      const bd = b.reset_at ? new Date(b.reset_at) : new Date(0);
      return bd - ad; // most recently used first
    });
  }
  return result;
}

function isOnCooldown(account) {
  if (!account.reset_at) return false;
  return new Date(account.reset_at) > new Date();
}
window.isOnCooldown = isOnCooldown; // expose for FAB

function buildAccountCard(account, index) {
  const cooldown = isOnCooldown(account);
  const accountProjects = (account.project_ids || (account.project_id ? [account.project_id] : []))
    .map(id => state.projects.find(p => p.id === id)).filter(Boolean);
  const projectTag = accountProjects.map(p =>
    `<span class="tag project" style="--proj-color:${p.color}" title="${escHtml(p.name)}">${escHtml(p.name.length > 16 ? p.name.slice(0,16)+'…' : p.name)}</span>`
  ).join('');
  const color = PLATFORM_COLORS[account.platform] || PLATFORM_COLORS.Other;

  const card = document.createElement('div');
  card.className = 'account-card';
  card.dataset.accountId = account.id;
  card.id = `card-${account.id}`;
  card.style.animationDelay = `${index * 40}ms`;

  const statusClass = cooldown ? 'cooling' : 'available';
  const statusLabel = cooldown ? 'On Cooldown' : 'Available';
  const statusDot = cooldown ? '●' : '●';

  const typeTag = account.account_type === 'pro'
    ? `<span class="tag pro">PRO</span>`
    : `<span class="tag free">FREE</span>`;

  const NOTE_ICONS = { Message:'💬', Image:'🖼', Code:'⌨', Search:'🔍' };
  const noteIcon = NOTE_ICONS[account.limit_note] || '📝';
  const noteHtml = account.limit_note
    ? `<div class="card-note"><span class="note-chip">${noteIcon} ${escHtml(account.limit_note)}</span></div>`
    : '';

  const countdownHtml = cooldown
    ? `<div class="countdown" id="cd-${account.id}" data-reset="${account.reset_at}">calculating…</div>`
    : `<div class="countdown ready">Ready ●</div>`;

  card.style.setProperty('--platform-color', color);
  card.innerHTML = `
    <div class="card-top">
      <div class="card-platform">
        <span style="background:${color};width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0"></span>
        <span style="font-size:0.75rem;font-weight:500;color:var(--text-muted)">${escHtml(account.platform)}</span>
      </div>
      ${typeTag}
    </div>
    <div class="card-email">${escHtml(account.email || '—')}</div>
    ${accountProjects.length ? `<div class="card-project-tags">${projectTag}</div>` : ''}
    ${noteHtml}
    <div class="card-status" style="display:flex;align-items:center;gap:0.4rem;margin:0.5rem 0;font-size:0.75rem;color:var(--text-muted)">
      <span style="width:6px;height:6px;border-radius:50%;background:${cooldown ? 'var(--amber)' : 'var(--green)'};flex-shrink:0"></span>
      <span>${statusLabel}</span>
    </div>
    ${countdownHtml}
    <div class="card-actions">
      ${cooldown
        ? `<button class="card-btn clear" onclick="handleClearLimit('${account.id}')">✓ Mark Ready</button>`
        : `<button class="card-btn limit" onclick="openLimitModal('${account.id}')">⏱ Log Limit</button>`
      }
      <button class="card-btn edit" onclick="openAccountModal('${account.id}')">Edit</button>
    </div>
  `;

  return card;
}

// ─── ACCOUNTS LIST VIEW ───────────────────────────────────────
function renderAccountsList() {
  const list = $('accounts-list');
  list.innerHTML = '';

  if (state.accounts.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">◉</span>
        <p>No accounts added yet.</p>
        <button class="btn-primary" onclick="openAccountModal()">+ Add Account</button>
      </div>`;
    return;
  }

  state.accounts.forEach((account, i) => {
    const accountProjects = (account.project_ids || (account.project_id ? [account.project_id] : []))
      .map(id => state.projects.find(p => p.id === id)).filter(Boolean);
    const cooldown = isOnCooldown(account);
    const color = PLATFORM_COLORS[account.platform] || PLATFORM_COLORS.Other;

    const item = document.createElement('div');
    item.className = 'account-list-item';
    item.style.animationDelay = `${i * 30}ms`;
    item.style.borderLeft = `3px solid ${color}`;

    item.innerHTML = `
      <div class="list-main">
        <div class="list-title">${escHtml(account.platform)} · ${escHtml(account.email || '—')}</div>
        <div class="list-sub">
          ${account.account_type?.toUpperCase() || 'FREE'}
          ${accountProjects.length ? ' · ' + accountProjects.map(p => escHtml(p.name)).join(', ') : ''}
          · <span class="${cooldown ? 'text-amber' : 'text-green'}">${cooldown ? 'On Cooldown' : 'Available'}</span>
        </div>
      </div>
      <div class="list-actions">
        ${cooldown
          ? `<button class="btn-icon" onclick="handleClearLimit('${account.id}')">✓ Ready</button>`
          : `<button class="btn-icon" onclick="openLimitModal('${account.id}')">⏱ Limit</button>`
        }
        <button class="btn-icon" onclick="openAccountModal('${account.id}')">Edit</button>
        <button class="btn-icon danger" onclick="handleDeleteAccount('${account.id}')">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });
}

// ─── PROJECTS LIST VIEW ───────────────────────────────────────
function renderProjectsList() {
  const list = $('projects-list');
  list.innerHTML = '';

  if (state.projects.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">◧</span>
        <p>No projects yet.</p>
        <button class="btn-primary" onclick="openProjectModal()">+ Add Project</button>
      </div>`;
    return;
  }

  state.projects.forEach((project, i) => {
    const accountCount = state.accounts.filter(a =>
      (a.project_ids || (a.project_id ? [a.project_id] : [])).includes(project.id)
    ).length;
    const item = document.createElement('div');
    item.className = 'project-list-item';
    item.style.animationDelay = `${i * 30}ms`;
    item.style.borderLeft = `3px solid ${project.color || '#6ee7b7'}`;

    item.innerHTML = `
      <div class="list-main" style="min-width:0;flex:1">
        <div class="list-title" style="word-break:break-word">${escHtml(project.name)}</div>
        <div class="list-sub">${escHtml(project.description || 'No description')} · ${accountCount} account${accountCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="list-actions" style="flex-shrink:0">
        <button class="btn-icon" onclick="openProjectModal('${project.id}')">Edit</button>
        <button class="btn-icon danger" onclick="handleDeleteProject('${project.id}')">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });
}

// ─── COUNTDOWN ENGINE ─────────────────────────────────────────
function startGlobalCountdownTick() {
  setInterval(() => {
    document.querySelectorAll('.countdown[data-reset]').forEach(el => {
      const resetAt = new Date(el.dataset.reset);
      const diff = resetAt - new Date();
      if (diff <= 0) {
        // Pulse the card before reloading
        const accountId = el.closest('.account-card')?.dataset.accountId;
        if (accountId) triggerResetPulse(accountId);
        // Small delay so pulse is visible before re-render
        setTimeout(() => { loadAll().then(renderView); scheduleResetCheck(); }, 600);
      } else {
        el.textContent = formatCountdown(diff);
      }
    });
  }, 1000);
}

// ─── RESET PULSE ──────────────────────────────────────────────
function triggerResetPulse(accountId) {
  const card = document.getElementById(`card-${accountId}`)
             || document.querySelector(`.account-card[data-id="${accountId}"]`);
  if (!card) return;
  card.classList.remove("reset-pulse");
  void card.offsetWidth;
  card.classList.add("reset-pulse");
  card.addEventListener("animationend", () => card.classList.remove("reset-pulse"), { once: true });
  const badge = document.createElement("span");
  badge.className = "reset-badge";
  badge.textContent = "✓ Ready";
  card.appendChild(badge);
  setTimeout(() => badge.remove(), 1700);
}

function formatCountdown(ms) {
  if (ms <= 0) return '0s';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Track active reset timeouts so we can clear duplicates
const _resetTimeouts = {};

// Check if any accounts just reset and notify
function scheduleResetCheck() {
  // Clear all previous timeouts
  Object.values(_resetTimeouts).forEach(id => clearTimeout(id));
  Object.keys(_resetTimeouts).forEach(k => delete _resetTimeouts[k]);

  state.accounts.forEach(account => {
    if (account.reset_at) {
      const resetAt = new Date(account.reset_at);
      const delay = resetAt - new Date();
      if (delay > 0 && delay < 60000) { // within next minute
        _resetTimeouts[account.id] = setTimeout(() => {
          notifyReset(account);
          triggerResetPulse(account.id);
          setTimeout(() => clearLimit(account.id).then(() => loadAll()).then(renderView), 600);
          delete _resetTimeouts[account.id];
        }, delay);
      }
    }
  });
}

// ─── MODAL: ACCOUNT ───────────────────────────────────────────
function openAccountModal(accountId = null) {
  state.editingAccountId = accountId;
  const account = accountId ? state.accounts.find(a => a.id === accountId) : null;

  $('modal-account-title').textContent = account ? 'Edit Account' : 'Add Account';
  $('account-id').value = accountId || '';
  $('account-email').value = account?.email || '';
  $('account-note').value = account?.note || '';

  // Platform picker
  const knownPlatforms = ['Claude','ChatGPT','Gemini','Grok','Copilot','Other'];
  const isKnown = knownPlatforms.includes(account?.platform);
  const platform = account ? (isKnown ? account.platform : 'Other') : 'Claude';
  state.selectedPlatform = platform;
  $$('.platform-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.platform === platform);
  });
  const customGroup = document.getElementById('custom-platform-group');
  const customInput = document.getElementById('custom-platform-name');
  if (platform === 'Other') {
    customGroup.classList.remove('hidden');
    customInput.value = (!isKnown && account?.platform) ? account.platform : '';
  } else {
    customGroup.classList.add('hidden');
    customInput.value = '';
  }

  // Type toggle
  const type = account?.account_type || 'free';
  state.selectedAccountType = type;
  $$('.toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });

  // Populate project checkboxes
  const container = $('account-projects-list');
  const currentIds = account?.project_ids || (account?.project_id ? [account.project_id] : []);
  if (state.projects.length === 0) {
    container.innerHTML = '<span class="checklist-empty">No projects yet — add one first</span>';
  } else {
    container.innerHTML = state.projects.map(p => `
      <label class="checklist-item">
        <input type="checkbox" value="${p.id}" ${currentIds.includes(p.id) ? 'checked' : ''} />
        <span class="checklist-dot" style="background:${p.color || '#6ee7b7'}"></span>
        <span class="checklist-name">${escHtml(p.name)}</span>
      </label>
    `).join('');
  }

  // Populate group checkboxes
  const groupsContainer = $('account-groups-list');
  const currentGroupIds = account?.group_ids || [];
  const groups = loadGroups();
  if (groups.length === 0) {
    groupsContainer.innerHTML = '<span class="checklist-empty">No groups yet — <button class="btn-link small" onclick="closeModal(\'modal-account\');switchView(\'groups\')" style="font-size:inherit">create one</button></span>';
  } else {
    groupsContainer.innerHTML = groups.map(g => `
      <label class="checklist-item">
        <input type="checkbox" value="${g.id}" ${currentGroupIds.includes(g.id) ? 'checked' : ''} />
        <span class="checklist-dot" style="background:${g.color || '#6ee7b7'}"></span>
        <span class="checklist-name">${escHtml(g.name)}</span>
      </label>
    `).join('');
  }

  openModal('modal-account');
}

async function handleSaveAccount() {
  const customName = document.getElementById('custom-platform-name').value.trim();
  const platform = state.selectedPlatform === 'Other' && customName ? customName : state.selectedPlatform;

  const email = $('account-email').value.trim();
  if (!email) { showToast('Please enter an email or label'); return; }

  const account = {
    id: state.editingAccountId || undefined,
    platform,
    email,
    account_type: state.selectedAccountType,
    project_ids: Array.from($('account-projects-list').querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value),
    group_ids: Array.from($('account-groups-list').querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value),
    note: $('account-note').value.trim() || null,
  };

  try {
    await saveAccount(account);
    await loadAll();
    renderView();
    closeModal('modal-account');
    showSuccess(state.editingAccountId ? 'Account updated' : 'Account added ✓');
  } catch (e) {
    console.error(e);
    showError('Failed to save account');
  }
}

async function handleDeleteAccount(id) {
  if (!confirm('Delete this account?')) return;
  try {
    await deleteAccount(id);
    await loadAll();
    renderView();
    showSuccess('Account deleted');
  } catch (e) {
    showError('Failed to delete');
  }
}

// ─── MODAL: LIMIT ─────────────────────────────────────────────
function openLimitModal(accountId) {
  const account = state.accounts.find(a => a.id === accountId);
  if (!account) return;

  $('limit-account-id').value = accountId;
  $('limit-account-label').textContent = `${account.platform} · ${account.email || '—'}`;
  $('limit-note').value = '';
  $('reset-datetime').value = '';

  // Suggest a reset time based on platform
  const hours = PLATFORM_RESET_HOURS[account.platform] || 3;
  const suggested = new Date(Date.now() + hours * 3600000);
  $('reset-datetime').value = toDatetimeLocalValue(suggested);

  // Clear quick-btn selections
  $$('.quick-btn').forEach(b => b.classList.remove('selected'));

  // Clear reason chips (limit modal only)
  document.querySelectorAll('#modal-limit .reason-chip').forEach(c => c.classList.remove('selected'));
  $('limit-note').style.display = 'none';
  $('limit-note').value = '';

  openModal('modal-limit');
}

async function handleSaveLimit() {
  const accountId = $('limit-account-id').value;
  const resetVal = $('reset-datetime').value;
  const selectedChip = document.querySelector('#modal-limit .reason-chip.selected');
  const note = selectedChip && selectedChip.dataset.reason !== 'Other'
    ? selectedChip.dataset.reason
    : $('limit-note').value.trim();

  if (!resetVal) { showToast('Please set a reset time'); return; }

  const resetAt = new Date(resetVal).toISOString();

  try {
    await logLimit(accountId, resetAt, note);
    // Record streak BEFORE render so the UI shows the updated count
    if (typeof window.recordStreakActivity === 'function') window.recordStreakActivity();
    await loadAll();
    renderView();
    closeModal('modal-limit');
    showSuccess('Limit logged ⏱');
    // Schedule a notification
    const account = state.accounts.find(a => a.id === accountId);
    if (account) scheduleNotification(account, new Date(resetAt));
  } catch (e) {
    console.error(e);
    showError('Failed to log limit');
  }
}

async function handleClearLimit(accountId) {
  try {
    triggerResetPulse(accountId);
    await clearLimit(accountId);
    await loadAll();
    renderView();
    showSuccess('Marked as ready ✓');
  } catch (e) {
    showError('Failed to update');
  }
}

// ─── MODAL: PROJECT ───────────────────────────────────────────
function openProjectModal(projectId = null) {
  state.editingProjectId = projectId;
  const project = projectId ? state.projects.find(p => p.id === projectId) : null;

  $('modal-project-title').textContent = project ? 'Edit Project' : 'Add Project';
  $('project-id').value = projectId || '';
  $('project-name').value = project?.name || '';
  $('project-desc').value = project?.description || '';

  const color = project?.color || '#6ee7b7';
  state.selectedColor = color;
  $$('.color-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === color);
  });

  openModal('modal-project');
}

async function handleSaveProject() {
  const name = $('project-name').value.trim();
  if (!name) { showToast('Please enter a project name'); return; }

  const project = {
    id: state.editingProjectId || undefined,
    name,
    description: $('project-desc').value.trim() || null,
    color: state.selectedColor,
  };

  try {
    await saveProject(project);
    await loadAll();
    renderView();
    closeModal('modal-project');
    showSuccess(state.editingProjectId ? 'Project updated' : 'Project added ✓');
  } catch (e) {
    showError('Failed to save project');
  }
}

async function handleDeleteProject(id) {
  if (!confirm('Delete this project? Accounts will be unlinked.')) return;
  try {
    await deleteProject(id);
    await loadAll();
    renderView();
    showSuccess('Project deleted');
  } catch (e) {
    showToast('Failed to delete');
  }
}

// ─── MODAL HELPERS ────────────────────────────────────────────
function openModal(id) {
  $(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  $(id).classList.remove('open');
  document.body.style.overflow = '';
  // Reset custom platform input when chat modal closes
  if (id === 'modal-chat') {
    const ci = document.getElementById('chat-custom-platform');
    if (ci) { ci.style.display = 'none'; ci.value = ''; }
  }
}

// ─── SIDEBAR ─────────────────────────────────────────────────
function openSidebar() {
  $('sidebar').classList.add('open');
  $('sidebar-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebar-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ─── UI EVENTS ────────────────────────────────────────────────
function bindUIEvents() {
  // ─── AUTH EVENTS ──────────────────────────────────────────
  let authMode = 'signin'; // 'signin' | 'signup'

  $('google-signin-btn').addEventListener('click', async () => {
    try {
      $('google-signin-btn').textContent = 'Redirecting…';
      await signInWithGoogle();
    } catch (e) {
      showError('Google sign in failed: ' + (e.message || e));
      $('google-signin-btn').innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/></svg> Continue with Google`;
    }
  });

  // Toggle signin/signup mode
  $('auth-switch-btn').addEventListener('click', () => {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    const isSignup = authMode === 'signup';
    $('email-action-btn').textContent = isSignup ? 'Create Account' : 'Sign In';
    $('auth-switch-text').textContent = isSignup ? 'Already have an account?' : "Don't have an account?";
    $('auth-switch-btn').textContent = isSignup ? 'Sign in' : 'Create one';
    $('auth-confirm-group').classList.toggle('hidden', !isSignup);
    $('forgot-pw-btn').classList.toggle('hidden', isSignup);
    $('auth-verify-msg').classList.add('hidden');
    $('auth-password-input').autocomplete = isSignup ? 'new-password' : 'current-password';
  });

  // Email action button
  $('email-action-btn').addEventListener('click', async () => {
    const email = $('auth-email-input').value.trim();
    const password = $('auth-password-input').value;
    const btn = $('email-action-btn');

    if (!email) { showToast('Enter your email'); return; }
    if (!password || password.length < 6) { showToast('Password must be 6+ characters'); return; }

    if (authMode === 'signup') {
      const confirm = $('auth-confirm-input').value;
      if (password !== confirm) { showToast('Passwords do not match'); return; }
    }

    btn.disabled = true;
    btn.textContent = authMode === 'signup' ? 'Creating account…' : 'Signing in…';

    try {
      if (authMode === 'signup') {
        const data = await signUpWithEmail(email, password);
        // Supabase may auto-confirm or require email verification
        if (data?.user && !data.session) {
          // Email confirmation required
          $('auth-verify-msg').classList.remove('hidden');
          showSuccess('Check your email to confirm your account ✉');
        } else if (data?.session) {
          // Auto-confirmed (email confirm disabled in Supabase)
          await showApp(data.session.user);
        }
      } else {
        await signInWithEmail(email, password);
        // onAuthChange will fire and call showApp
      }
    } catch (e) {
      showError(e.message || 'Auth failed');
    } finally {
      btn.disabled = false;
      btn.textContent = authMode === 'signup' ? 'Create Account' : 'Sign In';
    }
  });

  // Enter key on password → submit
  $('auth-password-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('email-action-btn').click();
  });
  $('auth-confirm-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('email-action-btn').click();
  });
  $('auth-email-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('auth-password-input').focus();
  });

  // Show/hide password toggle
  $('toggle-pw')?.addEventListener('click', () => {
    const inp = $('auth-password-input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  // Forgot password
  $('forgot-pw-btn')?.addEventListener('click', async () => {
    const email = $('auth-email-input').value.trim();
    if (!email) { showToast('Enter your email first'); return; }
    try {
      await sendPasswordReset(email);
      showSuccess('Password reset email sent ✉');
    } catch (e) {
      showError(e.message || 'Failed to send reset email');
    }
  });

  $('signout-btn').addEventListener('click', async () => {
    await signOut();
    if (typeof unsubscribeFromRealtime === 'function') unsubscribeFromRealtime();
    _showAppGuard = false;
    state.accounts = [];
    state.projects = [];
    state.prompts = [];
    state.accountTags = {};
    state.costPrices = {};
    state.groups = [];
    state.chats = [];
    state.notifHistory = [];
    state.streak = { streak: 0, lastLog: '', history: [] };
    showAuth();
  });

  // Sidebar
  $('hamburger').addEventListener('click', openSidebar);
  $('sidebar-close').addEventListener('click', closeSidebar);
  $('sidebar-overlay').addEventListener('click', closeSidebar);
  $('sidebar-logo').addEventListener('click', () => { closeSidebar(); switchView('dashboard'); });

  // Nav
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Topbar action
  $('topbar-action').addEventListener('click', () => {
    if (state.currentView === 'projects') openProjectModal();
    else if (state.currentView === 'messages') openMessageModal();
    else if (state.currentView === 'chats') openChatModal();
    else if (state.currentView === 'prompts') openPromptModal();
    else if (state.currentView === 'groups') openGroupModal();
    else if (state.currentView === 'compare') return;
    else openAccountModal();
  });

  // Empty state buttons (inline onclick handles these)

  // Platform picker
  $$('.platform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedPlatform = btn.dataset.platform;
      $$('.platform-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const isOther = btn.dataset.platform === 'Other';
      document.getElementById('custom-platform-group').classList.toggle('hidden', !isOther);
      if (isOther) document.getElementById('custom-platform-name').focus();
    });
  });

  // Type toggle
  $$('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedAccountType = btn.dataset.type;
      $$('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Color picker
  $$('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      state.selectedColor = swatch.dataset.color;
      $$('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    });
  });

  // Quick time buttons
  $$('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const hours = parseInt(btn.dataset.hours);
      const resetTime = new Date(Date.now() + hours * 3600000);
      $('reset-datetime').value = toDatetimeLocalValue(resetTime);
      $$('.quick-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Save buttons
  $('save-account-btn').addEventListener('click', handleSaveAccount);
  $('save-limit-btn').addEventListener('click', handleSaveLimit);
  $('save-project-btn').addEventListener('click', handleSaveProject);

  // Modal close buttons
  $$('.modal-close, [data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal || btn.closest('.modal-backdrop')?.id;
      if (modalId) closeModal(modalId);
    });
  });

  // Close modal on backdrop click
  $$('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });

  // Filter buttons
  $$('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      state.groupFilter = null;
      $$('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderDashboard();
    });
  });

  // ── H: Search ──
  const dashSearch = $('dash-search');
  if (dashSearch) {
    dashSearch.addEventListener('input', () => {
      state.search = dashSearch.value.trim();
      renderDashboard();
    });
  }

  // ── G: Sort pills ──
  document.querySelectorAll('#sort-pills .sort-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#sort-pills .sort-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.sort = pill.dataset.sort;
      renderDashboard();
    });
  });

  // ── F: Reason chips (scoped to limit modal only) ──
  document.querySelectorAll('#modal-limit .reason-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const isSelected = chip.classList.contains('selected');
      document.querySelectorAll('#modal-limit .reason-chip').forEach(c => c.classList.remove('selected'));
      const noteInput = $('limit-note');
      if (isSelected) {
        noteInput.style.display = 'none';
        noteInput.value = '';
      } else {
        chip.classList.add('selected');
        if (chip.dataset.reason === 'Other') {
          noteInput.style.display = 'block';
          noteInput.placeholder = 'Describe the reason…';
          noteInput.focus();
        } else {
          noteInput.style.display = 'none';
          noteInput.value = chip.dataset.reason;
        }
      }
    });
  });

  // Notification banner
  // ─── BELL PANEL ───────────────────────────────────────────
  const bellBtn = $('bell-btn');
  const notifPanel = $('notif-panel');
  const notifOverlay = $('notif-panel-overlay');

  function updateBellState() {
    const granted = Notification?.permission === 'granted';
    $('notif-toggle-btn').textContent = granted ? 'Disable' : 'Enable';
    $('notif-toggle-btn').classList.toggle('active', granted);
    const dot = $('bell-dot');
    const items = getNotifHistory();
    dot.classList.toggle('hidden', items.length === 0);
  }

  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !notifPanel.classList.contains('hidden');
    notifPanel.classList.toggle('hidden', open);
    notifOverlay.classList.toggle('hidden', open);
    if (!open) { renderNotifList(); updateBellState(); }
  });

  notifOverlay.addEventListener('click', () => {
    notifPanel.classList.add('hidden');
    notifOverlay.classList.add('hidden');
  });

  $('notif-toggle-btn').addEventListener('click', async () => {
    if (Notification?.permission === 'granted') {
      // Disable = just clear permission awareness (can't revoke, guide user)
      showToast('To fully disable, go to browser Settings → Site permissions');
    } else {
      await requestNotificationPermission();
    }
    updateBellState();
  });

  $('notif-clear-btn').addEventListener('click', () => {
    state.notifHistory = [];
    localStorage.removeItem('limitless_notif_history');
    if (typeof deleteUserData === 'function') deleteUserData('notifHistory').catch(() => {});
    renderNotifList();
    $('bell-dot').classList.add('hidden');
    showToast('Notifications cleared');
  });

  // Keep old banner wired (hidden by default now)
  $('enable-notif-btn')?.addEventListener('click', async () => {
    await requestNotificationPermission();
    $('notif-banner').classList.add('hidden');
    updateBellState();
  });
  $('dismiss-notif-btn')?.addEventListener('click', () => {
    $('notif-banner').classList.add('hidden');
    localStorage.setItem('limitless_notif_dismissed', '1');
  });
}

// ─── CLEAR LOCALSTORAGE SYNC KEYS ────────────────────────────
function clearLocalStorageSyncKeys() {
  ['limitless_prompts','limitless_account_tags','limitless_cost_prices','limitless_groups','limitless_chats','limitless_notif_history','limitless_streak','limitless_streak_last_log','limitless_streak_history','limitless_messages'].forEach(k => localStorage.removeItem(k));
}

// ─── TOAST ────────────────────────────────────────────────────
function showToast(msg, duration = 2800, type = '') {
  const toast = $('toast');
  toast.textContent = msg;
  toast.className = 'toast' + (type ? ' toast-' + type : '');
  toast.classList.add('show');
  clearTimeout(toast._tid);
  toast._tid = setTimeout(() => toast.classList.remove('show'), duration);
}
function showError(msg)   { showToast(msg, 3200, 'error'); }
function showSuccess(msg) { showToast(msg, 2600, 'success'); }
function showWarn(msg)    { showToast(msg, 3000, 'warn'); }

// ─── UTILS ────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toDatetimeLocalValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ─── SKELETON RENDERER ───────────────────────────────────────
function showSkeletons(grid, count = 4) {
  // Clear everything except the detached empty-state
  Array.from(grid.children).forEach(c => c.remove());
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'skeleton-card';
    el.innerHTML = `
      <div class="skeleton-line s-short"  style="animation-delay:${i*0.07}s"></div>
      <div class="skeleton-line s-medium" style="animation-delay:${i*0.07+0.05}s"></div>
      <div class="skeleton-line s-long"   style="animation-delay:${i*0.07+0.10}s"></div>
      <div class="skeleton-line s-btn"    style="animation-delay:${i*0.07+0.15}s"></div>
    `;
    grid.appendChild(el);
  }
}

// ─── OFFLINE BANNER ───────────────────────────────────────────
function showOfflineBanner(visible) {
  const banner = $('offline-banner');
  if (!banner) return;
  if (visible) {
    banner.classList.remove('hidden');
    requestAnimationFrame(() => banner.classList.add('show'));
  } else {
    banner.classList.remove('show');
    setTimeout(() => banner.classList.add('hidden'), 280);
  }
}

window.addEventListener('offline', () => showOfflineBanner(true));
window.addEventListener('online',  () => {
  showOfflineBanner(false);
  loadAll({ silent: true });
  showSuccess('Back online — refreshing…');
});

// ─── SESSION BANNER ───────────────────────────────────────────
function showSessionBanner() {
  const banner = $('session-banner');
  if (banner) banner.classList.remove('hidden');
}
function hideSessionBanner() {
  const banner = $('session-banner');
  if (banner) banner.classList.add('hidden');
}

// ─── BOOT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  init();
  initTheme();
  initExport();
  initChatsView();

  // Wire session-expired re-auth button
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

  // Show offline banner immediately if starting offline
  if (!navigator.onLine) showOfflineBanner(true);
});

// ─── NOTIFICATION HISTORY ─────────────────────────────────────
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
  if (typeof setUserData === 'function') setUserData('notifHistory', trimmed).catch(() => {});
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

// ═══════════════════════════════════════════════
//  #10 — DARK / LIGHT / AUTO THEME TOGGLE
// ═══════════════════════════════════════════════

const THEMES = ['auto', 'light', 'dark'];
const THEME_ICONS  = { auto: '◑', light: '○', dark: '●' };
const THEME_LABELS = { auto: 'Auto', light: 'Light', dark: 'Dark' };

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme'); // auto = follow system
  }
  // Update button
  const icon  = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (icon)  icon.textContent  = THEME_ICONS[theme]  || '◑';
  if (label) label.textContent = THEME_LABELS[theme] || 'Auto';
  localStorage.setItem('limitless_theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('limitless_theme') || 'auto';
  applyTheme(saved);
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = localStorage.getItem('limitless_theme') || 'auto';
    const idx = THEMES.indexOf(current);
    const next = THEMES[(idx + 1) % THEMES.length];
    applyTheme(next);
    showToast(`Theme: ${THEME_LABELS[next]}`);
  });
}

// Init theme immediately (before DOM ready to avoid flash)
(function() {
  const saved = localStorage.getItem('limitless_theme') || 'auto';
  if (saved === 'dark')  document.documentElement.setAttribute('data-theme', 'dark');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
})();

// ═══════════════════════════════════════════════
//  #5 — EXPORT / SHARE STATUS
// ═══════════════════════════════════════════════

function buildExportText() {
  if (!state.accounts || state.accounts.length === 0) return 'No accounts tracked.';

  const lines = state.accounts.map(a => {
    const cooldown = isOnCooldown(a);
    let status;
    if (cooldown) {
      const diff = new Date(a.reset_at) - new Date();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      status = h > 0 ? `⏱ ${h}h ${m}m` : `⏱ ${m}m`;
    } else {
      status = '✓ Ready';
    }
    const type = a.account_type === 'pro' ? 'Pro' : 'Free';
    return `${a.platform} [${type}] ${a.email || '—'} — ${status}`;
  });

  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `AI Account Status — ${date} ${now}\n${'─'.repeat(36)}\n${lines.join('\n')}`;
}

function initExport() {
  const btn = document.getElementById('export-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const text = buildExportText();
    try {
      await navigator.clipboard.writeText(text);
      showSuccess('Status copied to clipboard ✓');
      // Brief visual flash on button
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1200);
    } catch (e) {
      // Fallback: prompt with text
      prompt('Copy this status:', text);
    }
  });
}

// ═══════════════════════════════════════════════
//  #4 — TIMELINE VIEW
// ═══════════════════════════════════════════════

let tlWindowHours = 6;

function renderTimeline() {
  const now = new Date();
  const windowMs = tlWindowHours * 3600000;
  const windowEnd = new Date(now.getTime() + windowMs);

  const ready    = state.accounts.filter(a => !isOnCooldown(a));
  const cooling  = state.accounts.filter(a => isOnCooldown(a));
  const inWindow = cooling.filter(a => new Date(a.reset_at) <= windowEnd);
  const outside  = cooling.filter(a => new Date(a.reset_at) > windowEnd);

  // ── EMPTY STATE ──────────────────────────────
  const emptyEl = $('tl-empty');
  if (emptyEl) emptyEl.classList.toggle('hidden', cooling.length > 0);

  // ── READY NOW ────────────────────────────────
  const readyEl = $('tl-ready');
  if (readyEl) {
    if (ready.length === 0) {
      readyEl.innerHTML = '<div class="tl-empty-msg">Nothing available right now</div>';
    } else {
      readyEl.innerHTML = ready.map(a => {
        const color = PLATFORM_COLORS[a.platform] || PLATFORM_COLORS.Other;
        const email = (a.email || '').split('@')[0];
        return `
          <div class="tl-ready-pill" style="--pc:${color}">
            <span class="tl-rpill-dot" style="background:${color}"></span>
            <span class="tl-rpill-platform">${escHtml(a.platform)}</span>
            <span class="tl-rpill-email">${escHtml(email)}</span>
            <span class="tl-rpill-badge">✓</span>
          </div>`;
      }).join('');
    }
  }

  // ── RULER LABELS ─────────────────────────────
  const labelsEl = $('tl-labels');
  if (labelsEl) {
    labelsEl.innerHTML = '';
    const numTicks = tlWindowHours <= 6 ? tlWindowHours : (tlWindowHours <= 12 ? 6 : 8);
    for (let i = 0; i <= numTicks; i++) {
      const t = new Date(now.getTime() + (i / numTicks) * windowMs);
      const pct = (i / numTicks) * 100;
      const label = document.createElement('div');
      label.className = 'tl-hour-label';
      label.style.left = pct + '%';
      label.textContent = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (i === numTicks) label.style.transform = 'translateX(-100%)';
      else if (i > 0)     label.style.transform = 'translateX(-50%)';
      labelsEl.appendChild(label);
    }
  }

  // ── TRACK ────────────────────────────────────
  const track = $('tl-track');
  if (!track) return;

  // Clear old pills + ticks, keep now-line
  Array.from(track.children).forEach(c => {
    if (!c.classList.contains('tl-now-line')) c.remove();
  });

  // Hour tick marks
  const numTicks2 = tlWindowHours <= 6 ? tlWindowHours : (tlWindowHours <= 12 ? 6 : 8);
  for (let i = 1; i < numTicks2; i++) {
    const tick = document.createElement('div');
    tick.className = 'tl-tick';
    tick.style.left = ((i / numTicks2) * 100) + '%';
    track.appendChild(tick);
  }

  // Row-pack pills so they don't overlap
  const rows = [];
  const sorted = [...inWindow].sort((a, b) => new Date(a.reset_at) - new Date(b.reset_at));

  sorted.forEach(a => {
    const resetAt = new Date(a.reset_at);
    const pct = Math.max(1, Math.min(((resetAt - now) / windowMs) * 100, 97));
    let placed = false;
    for (const row of rows) {
      if (Math.abs(row[row.length - 1].pct - pct) > 11) {
        row.push({ account: a, pct }); placed = true; break;
      }
    }
    if (!placed) rows.push([{ account: a, pct }]);
  });

  rows.forEach((row, rowIdx) => {
    row.forEach(({ account, pct }) => {
      const color = PLATFORM_COLORS[account.platform] || PLATFORM_COLORS.Other;
      const resetAt = new Date(account.reset_at);
      const diff = resetAt - now;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const timeStr    = h > 0 ? `${h}h ${m}m` : `${m}m`;
      const resetClock = resetAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const email      = (account.email || '').split('@')[0];

      const pill = document.createElement('div');
      pill.className = 'tl-pill';
      pill.style.left = pct + '%';
      pill.style.top  = (24 + rowIdx * 52) + 'px';
      pill.innerHTML  = `
        <div class="tl-pill-stem" style="background:${color}"></div>
        <div class="tl-pill-body" style="border-color:${color}">
          <span class="tl-pill-dot" style="background:${color}"></span>
          <span class="tl-pill-platform">${escHtml(account.platform)}</span>
          <span class="tl-pill-time" style="color:${color}">${timeStr}</span>
        </div>
        <div class="tl-pill-tooltip">
          <div class="tl-tt-platform" style="color:${color}">${escHtml(account.platform)}</div>
          <div class="tl-tt-email">${escHtml(email)}</div>
          <div class="tl-tt-time">Resets at <strong>${resetClock}</strong></div>
          ${account.limit_note ? `<div class="tl-tt-note">📝 ${escHtml(account.limit_note)}</div>` : ''}
        </div>`;

      // Tap to toggle tooltip on mobile
      pill.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = pill.classList.contains('tip-open');
        document.querySelectorAll('.tl-pill.tip-open').forEach(p => p.classList.remove('tip-open'));
        if (!isOpen) pill.classList.add('tip-open');
      });
      track.appendChild(pill);
    });
  });

  // Adjust track height for rows
  track.style.minHeight = Math.max(90, 24 + rows.length * 52 + 28) + 'px';

  // ── LEGEND: accounts outside window ──────────
  const legendEl = $('tl-legend');
  if (legendEl) {
    legendEl.innerHTML = outside.length > 0
      ? `<div class="tl-legend-item"><span class="tl-legend-icon">◌</span><span>${outside.length} account${outside.length !== 1 ? 's' : ''} reset after the ${tlWindowHours}h window — increase window to see them</span></div>`
      : '';
  }

  // Close tooltips on outside click (once)
  setTimeout(() => {
    document.addEventListener('click', () => {
      document.querySelectorAll('.tl-pill.tip-open').forEach(p => p.classList.remove('tip-open'));
    }, { once: true });
  }, 0);
}

// Window-toggle buttons wired in main DOMContentLoaded handler

// Auto-refresh every 30s while on timeline
setInterval(() => {
  if (state.currentView === 'timeline') renderTimeline();
}, 30000);
// ════════════════════════════════════════════════════════════
//  FEATURE D — PWA INSTALL PROMPT
//  Captures beforeinstallprompt, shows a styled banner.
//  Also handles iOS Safari which has no event — shows manual
//  "Add to Home Screen" steps instead.
// ════════════════════════════════════════════════════════════
(function initPWAInstall() {
  const DISMISSED_KEY = 'limitless_pwa_dismissed';
  let deferredPrompt = null;

  // Don't show if already dismissed or already installed
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

  // ── Android / Chrome: beforeinstallprompt ──
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Wait until user is on the app screen (not auth)
    const tryShow = () => {
      if (document.getElementById('app-screen')?.classList.contains('active')) {
        showBanner();
      } else {
        setTimeout(tryShow, 800);
      }
    };
    setTimeout(tryShow, 1200); // slight delay after app loads
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

  // ── iOS Safari: no beforeinstallprompt event ──
  // Detect iOS and show manual instructions variant
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isIOS && isSafari && !alreadyInstalled()) {
    // Swap the install button for iOS instructions
    if (installBtn) {
      installBtn.outerHTML = `<span class="pwa-ios-steps">Tap <strong>Share ↑</strong> then<br/><strong>"Add to Home Screen"</strong></span>`;
    }
    // Show after short delay when app is active
    const tryShowIOS = () => {
      if (document.getElementById('app-screen')?.classList.contains('active')) {
        showBanner();
      } else {
        setTimeout(tryShowIOS, 800);
      }
    };
    setTimeout(tryShowIOS, 1500);
  }

  // Listen for appinstalled event — hide banner if installed from outside
  window.addEventListener('appinstalled', () => {
    hideBanner(true);
    localStorage.setItem(DISMISSED_KEY, '1');
    showToast('Limitless added to your home screen ✓');
  });
})();


// ════════════════════════════════════════════════════════════
//  FEATURE E — QUICK-SWITCH FLOATING BUTTON
//  Shows available accounts. Tap any → copies email.
//  Keyboard shortcut: Q to toggle.
// ════════════════════════════════════════════════════════════
(function initQuickSwitch() {
  const fab       = document.getElementById('qs-fab');
  const fabWrap   = document.getElementById('qs-fab-wrap');
  const panel     = document.getElementById('qs-panel');
  const list      = document.getElementById('qs-list');
  const countEl   = document.getElementById('qs-fab-count');
  const backdrop  = document.getElementById('qs-backdrop');

  if (!fab || !fabWrap) return;

  let panelOpen = false;

  // ── Update count badge ─────────────────────────────────
  function updateFAB() {
    // Only show FAB on app screen
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

  // ── Build panel list ────────────────────────────────────
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
            // Flash the item
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

  // ── Open / close ────────────────────────────────────────
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

  // ── Keyboard: Q to toggle ───────────────────────────────
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

  // ── Auto-refresh count every 30s + after state changes ──
  // Patch into the global loadAll so count stays accurate
  // updateFAB is called from waitForApp poll and setInterval.
  // window.state is a live reference so it always has current data.

  // Also poll every 60s for countdown changes
  setInterval(updateFAB, 60000);

  // Initial state — wait for app to be visible
  const waitForApp = setInterval(() => {
    const appActive = document.getElementById('app-screen')?.classList.contains('active');
    if (appActive) {
      updateFAB();
      clearInterval(waitForApp);
    }
  }, 300);
})();

// ═══════════════════════════════════════════════════════════════
//  N — SAVED CHATS
// ═══════════════════════════════════════════════════════════════

// ── Storage helpers ──
function loadChats() {
  if (state.chats.length) return state.chats;
  try { return JSON.parse(localStorage.getItem('limitless_chats') || '[]'); }
  catch { return []; }
}
function saveChats(chats) {
  state.chats = chats;
  localStorage.setItem('limitless_chats', JSON.stringify(chats));
  if (typeof setUserData === 'function') setUserData('chats', chats).catch(() => {});
}

// ── Render ──
function renderChats(query = '') {
  const list = document.getElementById('chats-list');
  if (!list) return;
  list.innerHTML = '';

  let chats = loadChats();
  if (query) {
    const q = query.toLowerCase();
    chats = chats.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.platform || '').toLowerCase().includes(q) ||
      (c.note || '').toLowerCase().includes(q)
    );
  }

  if (chats.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">◌</span>
        <p>${query ? 'No chats match your search.' : 'No saved chats yet.<br/>Save a link to any AI conversation to find it fast.'}</p>
        ${!query ? '<button class="btn-primary" onclick="openChatModal()">+ Save Chat</button>' : ''}
      </div>`;
    return;
  }

  chats.forEach((chat, i) => {
    const color = window.PLATFORM_COLORS?.[chat.platform] || '#888';
    const card = document.createElement('div');
    card.className = 'chat-card';
    card.style.animationDelay = `${i * 30}ms`;
    card.innerHTML = `
      <div class="chat-platform-dot" style="background:${color}"></div>
      <div class="chat-info">
        <div class="chat-title-text">${escHtml(chat.title || 'Untitled')}</div>
        <div class="chat-meta">
          <span>${escHtml(chat.platform || '')}</span>
          ${chat.note ? `<span>· ${escHtml(chat.note)}</span>` : ''}
          ${chat.url ? `<span style="color:var(--text-faint);overflow:hidden;text-overflow:ellipsis;max-width:200px">${escHtml(chat.url)}</span>` : ''}
        </div>
      </div>
      <div class="chat-actions">
        <button onclick="event.stopPropagation();openChatModal('${chat.id}')">Edit</button>
        ${chat.url ? `<button class="chat-open-btn" data-url="${escHtml(chat.url)}">Open ↗</button>` : ''}
        <button class="danger" onclick="event.stopPropagation();deleteChatById('${chat.id}')">Delete</button>
      </div>
    `;
    if (chat.url) {
      card.addEventListener('click', () => window.open(chat.url, '_blank'));
      const openBtn = card.querySelector('.chat-open-btn');
      if (openBtn) {
        openBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(chat.url, '_blank');
        });
      }
    }
    list.appendChild(card);
  });
}

function deleteChatById(id) {
  const chats = loadChats().filter(c => c.id !== id);
  saveChats(chats);
  renderChats(document.getElementById('chats-search')?.value || '');
  showToast('Chat removed');
}

// ── Modal ──
function openChatModal(chatId = null) {
  const chat = chatId ? loadChats().find(c => c.id === chatId) : null;
  document.getElementById('chat-id').value = chatId || '';
  document.getElementById('chat-title').value = chat?.title || '';
  document.getElementById('chat-url').value = chat?.url || '';
  document.getElementById('chat-note').value = chat?.note || '';

  // Platform chips
  const knownPlatforms = ['Claude','ChatGPT','Gemini','Grok','Copilot'];
  const savedPlatform = chat?.platform || 'Claude';
  const isKnown = knownPlatforms.includes(savedPlatform);
  const customInput = document.getElementById('chat-custom-platform');
  document.querySelectorAll('#chat-platform-chips .reason-chip').forEach(chip => {
    const match = isKnown
      ? chip.dataset.platform === savedPlatform
      : chip.dataset.platform === 'Other';
    chip.classList.toggle('selected', match);
  });
  if (!isKnown && savedPlatform) {
    customInput.style.display = 'block';
    customInput.value = savedPlatform;
  } else {
    customInput.style.display = 'none';
    customInput.value = '';
  }

  document.getElementById('modal-chat-title').textContent = chatId ? 'Edit Chat' : 'Save Chat';
  openModal('modal-chat');
}

function handleSaveChat() {
  const id = document.getElementById('chat-id').value;
  const title = document.getElementById('chat-title').value.trim();
  const url = document.getElementById('chat-url').value.trim();
  const note = document.getElementById('chat-note').value.trim();
  const selectedChipPlatform = document.querySelector('#chat-platform-chips .reason-chip.selected')?.dataset.platform || 'Other';
  const customPlatformVal = document.getElementById('chat-custom-platform')?.value.trim();
  const platform = selectedChipPlatform === 'Other' && customPlatformVal ? customPlatformVal : selectedChipPlatform;

  if (!title) { showToast('Please enter a title'); return; }

  const chats = loadChats();
  if (id) {
    const idx = chats.findIndex(c => c.id === id);
    if (idx >= 0) chats[idx] = { ...chats[idx], title, url, note, platform };
  } else {
    chats.unshift({ id: Date.now().toString(), title, url, note, platform, saved_at: new Date().toISOString() });
  }
  saveChats(chats);
  closeModal('modal-chat');
  renderChats();
  showToast(id ? 'Chat updated ◌' : 'Chat saved ◌');
}

// ── Init (called once from main init) ──
function initChatsView() {
  // Save button in modal
  document.getElementById('save-chat-btn')?.addEventListener('click', handleSaveChat);

  // Add chat buttons
  document.getElementById('add-chat-btn')?.addEventListener('click', () => openChatModal());
  document.getElementById('empty-add-chat-btn')?.addEventListener('click', () => openChatModal());

  // Platform chips in chat modal
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

  // Search
  document.getElementById('chats-search')?.addEventListener('input', e => {
    renderChats(e.target.value.trim());
  });
}


// ═══════════════════════════════════════════════════════════════
//  O — MODEL COMPARISON TABLE
// ═══════════════════════════════════════════════════════════════

const MODEL_DATA = [
  {
    platform: 'Claude',
    free_limit:  '~20 msgs / 5 hrs (Sonnet)',
    pro_limit:   '~100 msgs / 5 hrs (Opus)',
    context:     '200K tokens',
    free_cost:   'Free',
    pro_cost:    '$20 / mo',
    reset:       '5 hours',
  },
  {
    platform: 'ChatGPT',
    free_limit:  '~10–15 msgs / 3 hrs (GPT-4o)',
    pro_limit:   '80 msgs / 3 hrs (GPT-4o)',
    context:     '128K tokens',
    free_cost:   'Free',
    pro_cost:    '$20 / mo',
    reset:       '3 hours',
  },
  {
    platform: 'Gemini',
    free_limit:  '~60 msgs / day (Gemini 1.5 Pro)',
    pro_limit:   '~1000 msgs / day',
    context:     '1M tokens',
    free_cost:   'Free',
    pro_cost:    '$19.99 / mo',
    reset:       '24 hours',
  },
  {
    platform: 'Grok',
    free_limit:  '~10 msgs / 2 hrs (Grok-2)',
    pro_limit:   '~100 msgs / 2 hrs',
    context:     '131K tokens',
    free_cost:   'Free (X account)',
    pro_cost:    '$8–$16 / mo',
    reset:       '2 hours',
  },
  {
    platform: 'Copilot',
    free_limit:  '~30 turns / day',
    pro_limit:   'Higher priority, faster',
    context:     '~16K tokens',
    free_cost:   'Free (Microsoft account)',
    pro_cost:    '$20 / mo',
    reset:       '24 hours',
  },
];

function renderCompare() {
  const tbody = document.getElementById('compare-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  MODEL_DATA.forEach(m => {
    const color = window.PLATFORM_COLORS?.[m.platform] || '#888';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="compare-model-name">
          <span class="compare-dot" style="background:${color}"></span>
          ${escHtml(m.platform)}
        </div>
      </td>
      <td>${escHtml(m.free_limit)}</td>
      <td>${escHtml(m.pro_limit)}</td>
      <td>${escHtml(m.context)}</td>
      <td><span class="compare-badge free">${escHtml(m.free_cost)}</span></td>
      <td><span class="compare-badge pro">${escHtml(m.pro_cost)}</span></td>
      <td>${escHtml(m.reset)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Wired via main DOMContentLoaded handler ──
// ════════════════════════════════════════════════════════════
//  FEATURE I — USAGE STREAKS 🔥
//  Tracks consecutive days the user has logged at least one
//  limit. Persisted in localStorage. Shown in sidebar and
//  as a dashboard stat card.
// ════════════════════════════════════════════════════════════

(function initStreaks() {
  const STREAK_KEY     = 'limitless_streak';
  const LAST_LOG_KEY   = 'limitless_streak_last_log';
  const HISTORY_KEY    = 'limitless_streak_history'; // array of ISO date strings

  // ── Helpers ─────────────────────────────────────────────
  function todayStr() {
    return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  }

  function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function getStreakData() {
    // Use Supabase-synced cache if available, fall back to localStorage
    if (state.streak.lastLog) return state.streak;
    return {
      streak:   parseInt(localStorage.getItem(STREAK_KEY)   || '0'),
      lastLog:  localStorage.getItem(LAST_LOG_KEY) || '',
      history:  JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'),
    };
  }

  function saveStreakData({ streak, lastLog, history }) {
    state.streak = { streak, lastLog, history };
    localStorage.setItem(STREAK_KEY,   String(streak));
    localStorage.setItem(LAST_LOG_KEY, lastLog);
    localStorage.setItem(HISTORY_KEY,  JSON.stringify(history));
    if (typeof setUserData === 'function') setUserData('streak', { streak, lastLog, history }).catch(() => {});
  }

  // ── Record activity for today ────────────────────────────
  function recordActivity() {
    const today = todayStr();
    const data  = getStreakData();

    // Already logged today → nothing to do
    if (data.lastLog === today) return data.streak;

    let newStreak;
    if (data.lastLog === yesterdayStr()) {
      // Consecutive day — extend streak
      newStreak = data.streak + 1;
    } else {
      // Gap or first ever — restart
      newStreak = 1;
    }

    // Add today to history (deduplicated)
    const history = data.history.filter(d => d !== today);
    history.push(today);
    // Keep last 90 days only
    const trimmed = history.slice(-90);

    saveStreakData({ streak: newStreak, lastLog: today, history: trimmed });
    renderStreakEverywhere(newStreak, trimmed);

    // Celebrate milestones
    if ([3, 7, 14, 30, 60, 90].includes(newStreak)) {
      setTimeout(() => showSuccess(`🔥 ${newStreak}-day streak! Keep it up!`), 400);
    }

    return newStreak;
  }

  // ── Expose so handleSaveLimit can call it ────────────────
  window.recordStreakActivity = recordActivity;

  // ── Render the streak pill in the sidebar ────────────────
  function renderStreakPill(streak) {
    let pill = document.getElementById('streak-pill');
    if (!pill) return;
    const { label, cls } = streakMeta(streak);
    pill.innerHTML = `<span class="streak-flame">${label}</span><span class="streak-count">${streak}</span><span class="streak-label">day streak</span>`;
    pill.className = 'streak-pill ' + cls;
    pill.title = streak === 0
      ? 'Log a limit today to start your streak!'
      : `${streak}-day streak — log a limit daily to keep it going`;
  }

  // ── Render the dashboard mini-card ───────────────────────
  function renderStreakStatCard(streak, history) {
    const card = document.getElementById('stat-streak-card');
    if (!card) return;
    const { label } = streakMeta(streak);
    const today = todayStr();
    const loggedToday = history.includes(today);

    card.innerHTML = `
      <div class="streak-stat-top">
        <span class="streak-stat-flame">${label}</span>
        <span class="streak-stat-num">${streak}</span>
      </div>
      <span class="stat-label">day streak</span>
      <div class="streak-dots">${buildDots(history)}</div>
      ${!loggedToday ? '<div class="streak-warn">Log today to keep it!</div>' : ''}
    `;
    card.classList.toggle('streak-active', streak > 0);
  }

  // ── 7-dot history grid (last 7 days) ────────────────────
  function buildDots(history) {
    const dots = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const active = history.includes(ds);
      const dayLabel = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
      dots.push(`<div class="streak-dot ${active ? 'on' : 'off'}" title="${ds}"><span>${dayLabel}</span></div>`);
    }
    return dots.join('');
  }

  // ── Flame icon + tier ────────────────────────────────────
  function streakMeta(streak) {
    if (streak === 0)  return { label: '○', cls: 'tier-zero' };
    if (streak < 3)    return { label: '🔥', cls: 'tier-low' };
    if (streak < 7)    return { label: '🔥', cls: 'tier-mid' };
    if (streak < 14)   return { label: '🔥', cls: 'tier-high' };
    if (streak < 30)   return { label: '🔥', cls: 'tier-epic' };
    return               { label: '🔥', cls: 'tier-legendary' };
  }

  // ── Render everywhere ────────────────────────────────────
  function renderStreakEverywhere(streak, history) {
    renderStreakPill(streak);
    renderStreakStatCard(streak, history);
  }

  // ── Public init — called after app loads ─────────────────
  window.initStreakUI = function () {
    const { streak, history } = getStreakData();
    // Check if streak is stale (last log was > yesterday → streak resets to 0)
    const data = getStreakData();
    const today = todayStr();
    const yesterday = yesterdayStr();
    let currentStreak = data.streak;
    if (data.lastLog && data.lastLog !== today && data.lastLog !== yesterday) {
      // Streak broken
      currentStreak = 0;
      saveStreakData({ streak: 0, lastLog: data.lastLog, history: data.history });
    }
    renderStreakEverywhere(currentStreak, data.history);
  };
})();


// ═══════════════════════════════════════════════════════════════
//  PROFILE & SETTINGS VIEW
// ═══════════════════════════════════════════════════════════════

function renderSettings() {
  // Fill in current user info
  const name = $('user-name')?.textContent || '';
  const emailDisplay = currentUser?.email || '';

  // Populate header
  const dispName = $('settings-display-name');
  const dispEmail = $('settings-email-display');
  if (dispName) dispName.textContent = name;
  if (dispEmail) dispEmail.textContent = emailDisplay;

  // Avatar
  const avatarImg = $('settings-avatar-img');
  const avatarInitials = $('settings-avatar-initials');
  const avatarUrl = currentUser?.user_metadata?.avatar_url;
  if (avatarImg && avatarUrl) {
    avatarImg.src = avatarUrl;
    avatarImg.style.display = 'block';
    if (avatarInitials) avatarInitials.style.display = 'none';
  } else {
    if (avatarImg) avatarImg.style.display = 'none';
    if (avatarInitials) {
      avatarInitials.style.display = 'flex';
      avatarInitials.textContent = (name || emailDisplay || 'U')[0].toUpperCase();
    }
  }

  // Pre-fill name input
  const nameInput = $('settings-name-input');
  if (nameInput) nameInput.value = name;

  // Show current email as read-only display (never in the input)
  const currentEmailDisplay = $('settings-current-email-display');
  if (currentEmailDisplay) currentEmailDisplay.textContent = emailDisplay || '—';
  // Clear the new email input — never pre-fill
  const emailInput = $('settings-new-email');
  if (emailInput) { emailInput.value = ''; emailInput.placeholder = 'Enter new email…'; }

  // Theme picker — mark active
  const savedTheme = localStorage.getItem('limitless_theme') || 'auto';
  document.querySelectorAll('[data-theme-pick]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themePick === savedTheme);
  });

  // Email alerts toggle state
  const emailToggle = $('settings-email-toggle');
  if (emailToggle) {
    const emailState = localStorage.getItem('limitless_email_alerts');
    if (emailState === 'off') {
      emailToggle.textContent = 'OFF';
      emailToggle.className = 'btn-ghost small danger';
    } else {
      emailToggle.textContent = 'ON';
      emailToggle.className = 'btn-ghost small';
    }
  }

  // Notifications status
  const notifStatus = $('settings-notif-status');
  const notifBtn = $('settings-notif-btn');
  if (notifStatus && notifBtn) {
    const perm = Notification?.permission || 'default';
    if (perm === 'granted') {
      notifStatus.textContent = 'Enabled — you will be notified when limits reset.';
      notifBtn.textContent = 'Enabled ✓';
      notifBtn.disabled = true;
    } else if (perm === 'denied') {
      notifStatus.textContent = 'Blocked by browser. Go to browser settings to allow.';
      notifBtn.textContent = 'Blocked';
      notifBtn.disabled = true;
    } else {
      notifStatus.textContent = 'Not enabled yet.';
      notifBtn.textContent = 'Enable';
      notifBtn.disabled = false;
    }
  }
}

// ── Wire Settings events (once on DOMContentLoaded) ──────────
document.addEventListener('DOMContentLoaded', () => {

  // Save display name
  $('save-name-btn')?.addEventListener('click', async () => {
    const name = $('settings-name-input')?.value.trim();
    if (!name) { showToast('Enter a display name'); return; }
    const btn = $('save-name-btn');
    btn.disabled = true; btn.textContent = '…';
    try {
      await updateDisplayName(name);
      // Update sidebar immediately
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

  // Update email
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

  // Change password
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

  // Show/hide password in settings
  $('toggle-settings-pw')?.addEventListener('click', () => {
    const input = $('settings-new-password');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // Send password reset email
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

  // Theme picker in settings
  document.querySelectorAll('[data-theme-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.themePick;
      applyTheme(theme);
      document.querySelectorAll('[data-theme-pick]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Also sync the sidebar theme toggle label/icon
      showToast(`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`);
    });
  });

  // Enable notifications from settings
  $('settings-notif-btn')?.addEventListener('click', async () => {
    if (typeof requestNotificationPermission === 'function') {
      await requestNotificationPermission();
      renderSettings();
    }
  });

  // Email alerts toggle
  $('settings-email-toggle')?.addEventListener('click', () => {
    const current = localStorage.getItem('limitless_email_alerts');
    const next = current === 'off' ? 'on' : 'off';
    localStorage.setItem('limitless_email_alerts', next);
    $('settings-email-toggle').textContent = next === 'off' ? 'OFF' : 'ON';
    $('settings-email-toggle').className = next === 'off' ? 'btn-ghost small danger' : 'btn-ghost small';
    // If turning on, init EmailJS (may not have been inited if it was off)
    if (next === 'on' && typeof emailjs !== 'undefined') {
      emailjs.init(EMAILJS_PUBLIC_KEY);
    }
    showToast(next === 'off' ? 'Email alerts off' : 'Email alerts on');
  });

  // Sign out from settings
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

  // Delete all data
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

});

// ═══════════════════════════════════════════════════════════════
//  MESSAGES — Save full conversations (prompt + AI reply)
// ═══════════════════════════════════════════════════════════════
const MSG_KEY = 'limitless_messages';

function loadMessages() {
  try { return JSON.parse(localStorage.getItem(MSG_KEY) || '[]'); }
  catch { return []; }
}

function saveMessages(msgs) {
  localStorage.setItem(MSG_KEY, JSON.stringify(msgs));
  state.messages = msgs;
}

// ── Render ──────────────────────────────────────────────────
function renderMessages(query = '') {
  const list = document.getElementById('messages-list');
  if (!list) return;

  let msgs = loadMessages();

  if (query) {
    const q = query.toLowerCase();
    msgs = msgs.filter(m =>
      (m.title || '').toLowerCase().includes(q) ||
      (m.platform || '').toLowerCase().includes(q) ||
      (m.prompt || '').toLowerCase().includes(q) ||
      (m.reply || '').toLowerCase().includes(q) ||
      (m.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  list.innerHTML = '';

  if (msgs.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">✦</span>
        <p>${query ? 'No messages match your search.' : 'No messages saved yet.<br/>Save any AI conversation — your prompt and the reply.'}</p>
        ${!query ? '<button class="btn-primary" onclick="openMessageModal()">+ Save Message</button>' : ''}
      </div>`;
    return;
  }

  msgs.forEach((msg, i) => {
    const color = window.PLATFORM_COLORS?.[msg.platform] || '#888';
    const card = document.createElement('div');
    card.className = 'message-card';
    card.style.animationDelay = `${i * 25}ms`;
    const tagsHtml = (msg.tags || []).map(t =>
      `<span class="msg-tag">${escHtml(t)}</span>`
    ).join('');
    const promptPreview = (msg.prompt || '').slice(0, 120);
    const replyPreview  = (msg.reply  || '').slice(0, 160);
    const dateStr = msg.created_at
      ? new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
      : '';

    card.innerHTML = `
      <div class="msg-card-header">
        <div class="msg-card-left">
          <span class="msg-platform-dot" style="background:${color}"></span>
          <span class="msg-platform-name">${escHtml(msg.platform || '')}</span>
          ${msg.title ? `<span class="msg-card-title">${escHtml(msg.title)}</span>` : ''}
        </div>
        <div class="msg-card-meta">
          ${dateStr ? `<span class="msg-date">${dateStr}</span>` : ''}
          <div class="msg-card-actions">
            <button class="msg-action-btn" title="Edit" onclick="event.stopPropagation();openMessageModal('${msg.id}')">✎</button>
            <button class="msg-action-btn" title="Copy prompt" onclick="event.stopPropagation();copyMsgPart('${msg.id}','prompt')">⊡</button>
            <button class="msg-action-btn" title="Export" onclick="event.stopPropagation();exportMessage('${msg.id}')">↓</button>
            <button class="msg-action-btn danger" title="Delete" onclick="event.stopPropagation();deleteMessage('${msg.id}')">✕</button>
          </div>
        </div>
      </div>
      <div class="msg-card-body">
        <div class="msg-bubble msg-bubble-user">
          <span class="msg-bubble-label">You</span>
          <div class="msg-bubble-text">${escHtml(promptPreview)}${msg.prompt && msg.prompt.length > 120 ? '<span class="msg-truncate">…</span>' : ''}</div>
        </div>
        <div class="msg-bubble msg-bubble-ai">
          <span class="msg-bubble-label">${escHtml(msg.platform || 'AI')}</span>
          <div class="msg-bubble-text">${escHtml(replyPreview)}${msg.reply && msg.reply.length > 160 ? '<span class="msg-truncate"> — tap to read more</span>' : ''}</div>
        </div>
      </div>
      ${tagsHtml ? `<div class="msg-card-tags">${tagsHtml}</div>` : ''}
    `;

    card.addEventListener('click', () => openMessageViewer(msg.id));
    list.appendChild(card);
  });
}

// ── Full viewer modal ──────────────────────────────────────
function openMessageViewer(msgId) {
  const msg = loadMessages().find(m => m.id === msgId);
  if (!msg) return;
  const color = window.PLATFORM_COLORS?.[msg.platform] || '#888';

  document.getElementById('msg-view-title').textContent = msg.title || 'Message';
  document.getElementById('msg-view-platform').innerHTML =
    `<span style="display:inline-flex;align-items:center;gap:0.4rem;font-size:0.75rem;color:var(--text-muted)"><span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0"></span>${escHtml(msg.platform || '')}</span>`;
  document.getElementById('msg-view-prompt').textContent = msg.prompt || '—';
  document.getElementById('msg-view-reply').textContent  = msg.reply  || '—';

  const tagsEl = document.getElementById('msg-view-tags');
  tagsEl.innerHTML = (msg.tags || []).map(t => `<span class="msg-tag">${escHtml(t)}</span>`).join('');

  // Wire action buttons
  const copyPromptBtn = document.getElementById('msg-view-copy-prompt');
  const copyReplyBtn  = document.getElementById('msg-view-copy-reply');
  const copyBothBtn   = document.getElementById('msg-view-copy-both');
  const exportBtn     = document.getElementById('msg-view-export');

  copyPromptBtn.onclick = () => { navigator.clipboard.writeText(msg.prompt || ''); showSuccess('Prompt copied ✓'); };
  copyReplyBtn.onclick  = () => { navigator.clipboard.writeText(msg.reply  || ''); showSuccess('Reply copied ✓'); };
  copyBothBtn.onclick   = () => {
    const text = `[My Message]\n${msg.prompt || ''}\n\n[${msg.platform || 'AI'} Reply]\n${msg.reply || ''}`;
    navigator.clipboard.writeText(text);
    showSuccess('Both copied ✓');
  };
  exportBtn.onclick = () => exportMessage(msgId);

  openModal('modal-message-view');
}

// ── Save modal ─────────────────────────────────────────────
function openMessageModal(msgId = null) {
  const msg = msgId ? loadMessages().find(m => m.id === msgId) : null;
  document.getElementById('message-id').value = msgId || '';
  document.getElementById('message-title').value   = msg?.title  || '';
  document.getElementById('message-prompt').value  = msg?.prompt || '';
  document.getElementById('message-reply').value   = msg?.reply  || '';
  document.getElementById('message-tags').value    = (msg?.tags || []).join(', ');

  const knownPlatforms = ['Claude','ChatGPT','Gemini','Grok','Copilot'];
  const savedPlatform = msg?.platform || 'Claude';
  const isKnown = knownPlatforms.includes(savedPlatform);
  const customInput = document.getElementById('message-custom-platform');
  document.querySelectorAll('#message-platform-chips .reason-chip').forEach(chip => {
    const match = isKnown ? chip.dataset.platform === savedPlatform : chip.dataset.platform === 'Other';
    chip.classList.toggle('selected', match);
  });
  if (!isKnown && savedPlatform) {
    customInput.style.display = 'block';
    customInput.value = savedPlatform;
  } else {
    customInput.style.display = 'none';
    customInput.value = '';
  }

  document.getElementById('modal-message-title').textContent = msgId ? 'Edit Message' : 'Save Message';
  updateCharCount('message-prompt', 'prompt-char-count');
  updateCharCount('message-reply',  'reply-char-count');
  openModal('modal-message');
}

function handleSaveMessage() {
  const id      = document.getElementById('message-id').value;
  const title   = document.getElementById('message-title').value.trim();
  const prompt  = document.getElementById('message-prompt').value.trim();
  const reply   = document.getElementById('message-reply').value.trim();
  const tagsRaw = document.getElementById('message-tags').value.trim();
  const tags    = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const selectedChip = document.querySelector('#message-platform-chips .reason-chip.selected');
  const customPlatform = document.getElementById('message-custom-platform')?.value.trim();
  const platform = (selectedChip?.dataset.platform === 'Other' && customPlatform)
    ? customPlatform
    : (selectedChip?.dataset.platform || 'Claude');

  if (!prompt && !reply) { showWarn('Add at least a prompt or a reply'); return; }

  let msgs = loadMessages();
  if (id) {
    const idx = msgs.findIndex(m => m.id === id);
    if (idx > -1) msgs[idx] = { ...msgs[idx], title, prompt, reply, tags, platform };
  } else {
    msgs.unshift({ id: Date.now().toString(), title, prompt, reply, tags, platform, created_at: new Date().toISOString() });
  }
  saveMessages(msgs);
  if (typeof setUserData === 'function') setUserData('messages', msgs).catch(() => {});
  closeModal('modal-message');
  renderMessages(document.getElementById('messages-search')?.value || '');
  showSuccess(id ? 'Message updated ✓' : 'Message saved ✦');
}

function deleteMessage(msgId) {
  const updated = loadMessages().filter(m => m.id !== msgId);
  saveMessages(updated);
  if (typeof setUserData === 'function') setUserData('messages', updated).catch(() => {});
  renderMessages(document.getElementById('messages-search')?.value || '');
  showSuccess('Message deleted');
}

function copyMsgPart(msgId, part) {
  const msg = loadMessages().find(m => m.id === msgId);
  if (!msg) return;
  navigator.clipboard.writeText(part === 'prompt' ? (msg.prompt || '') : (msg.reply || ''));
  showSuccess(part === 'prompt' ? 'Prompt copied ✓' : 'Reply copied ✓');
}

function exportMessage(msgId) {
  const msg = loadMessages().find(m => m.id === msgId);
  if (!msg) return;
  const lines = [
    msg.title ? `# ${msg.title}` : '# Saved Message',
    `Platform: ${msg.platform || '—'}`,
    msg.tags?.length ? `Tags: ${msg.tags.join(', ')}` : '',
    msg.created_at ? `Saved: ${new Date(msg.created_at).toLocaleString()}` : '',
    '',
    '## My Message',
    msg.prompt || '—',
    '',
    `## ${msg.platform || 'AI'} Reply`,
    msg.reply || '—',
  ].filter(l => l !== null).join('\n');

  const blob = new Blob([lines], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(msg.title || 'message').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  showSuccess('Exported ↓');
}

// ── Char counter helper ────────────────────────────────────
function updateCharCount(textareaId, countId) {
  const ta = document.getElementById(textareaId);
  const el = document.getElementById(countId);
  if (!ta || !el) return;
  const update = () => { el.textContent = ta.value.length > 0 ? `${ta.value.length} chars` : ''; };
  update();
  ta.addEventListener('input', update);
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Search
  document.getElementById('messages-search')?.addEventListener('input', e => {
    renderMessages(e.target.value);
  });

  // Add button
  document.getElementById('add-message-btn')?.addEventListener('click', () => openMessageModal());

  // Save button
  document.getElementById('save-message-btn')?.addEventListener('click', handleSaveMessage);

  // Reset custom platform input when modal closes
  document.querySelector('#modal-message .modal-close')?.addEventListener('click', () => {
    const ci = document.getElementById('message-custom-platform');
    if (ci) { ci.style.display = 'none'; ci.value = ''; }
  });
  document.querySelector('#modal-message [data-modal="modal-message"]')?.addEventListener('click', () => {
    const ci = document.getElementById('message-custom-platform');
    if (ci) { ci.style.display = 'none'; ci.value = ''; }
  });

  // Platform chips (scoped to message modal)
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

  // Char counts while typing in modal
  document.getElementById('message-prompt')?.addEventListener('input', () => updateCharCount('message-prompt', 'prompt-char-count'));
  document.getElementById('message-reply')?.addEventListener('input',  () => updateCharCount('message-reply',  'reply-char-count'));
});