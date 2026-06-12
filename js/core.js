'use strict';

async function init() {
  try {
    const hasSupabase = initSupabase();

    if (!hasSupabase) {
      document.getElementById('auth-not-configured')?.classList.remove('hidden');
      document.getElementById('google-signin-btn').disabled = true;
      document.getElementById('email-action-btn').disabled = true;
      showAuth();
    } else {
      onAuthChange(async (session, event) => {
        try {
          if (!session) {
            showAuth();
            if (event === 'SIGNED_OUT') {
              localStorage.removeItem('limitless_logged_in');
              _showAppGuard = false;
              state.accounts = [];
              state.projects = [];
            }
            return;
          }
          localStorage.setItem('limitless_logged_in', '1');
          hideSessionBanner();
          if (!_showAppGuard) {
            await showApp(session.user);
          }
        } catch (e) {
          console.error('Auth change error:', e);
        }
      });

      const hasLoggedInBefore = localStorage.getItem('limitless_logged_in');
      if (hasLoggedInBefore && !_showAppGuard) {
        try {
          const session = await getSession();
          if (session) {
            await showApp(session.user);
          }
        } catch (_) {}
      }
    }

    bindUIEvents();
    startGlobalCountdownTick();
    ptrInit();
  } catch (e) {
    console.error('Init failed:', e);
    showAuth();
  }
}

function showAuth() {
  const loading = document.getElementById('loading-screen');
  if (loading) loading.classList.add('hidden');
  $('auth-screen').classList.add('active');
  $('app-screen').classList.remove('active');
}

async function showApp(user) {
  if (_showAppGuard) return;
  _showAppGuard = true;
  $('loading-screen')?.classList.add('hidden');

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

  if (navigator.onLine) await queueDrain();

  if (typeof loadAllUserData === 'function') {
    try {
      const userData = await loadAllUserData();
      if (userData.prompts) { state.prompts = userData.prompts; localStorage.setItem('limitless_prompts', JSON.stringify(userData.prompts)); }
      if (userData.accountTags) { state.accountTags = userData.accountTags; localStorage.setItem('limitless_account_tags', JSON.stringify(userData.accountTags)); }
      if (userData.costPrices) { state.costPrices = userData.costPrices; }
      if (userData.groups) { state.groups = userData.groups; localStorage.setItem('limitless_groups', JSON.stringify(userData.groups)); }
      if (userData.chats) { state.chats = userData.chats; localStorage.setItem('limitless_chats', JSON.stringify(userData.chats)); }
      if (userData.notifHistory) { state.notifHistory = userData.notifHistory; localStorage.setItem('limitless_notif_history', JSON.stringify(userData.notifHistory)); }
      if (userData.streak) {
        state.streak = userData.streak;
        localStorage.setItem('limitless_streak', String(userData.streak.streak || 0));
        localStorage.setItem('limitless_streak_last_log', userData.streak.lastLog || '');
        localStorage.setItem('limitless_streak_history', JSON.stringify(userData.streak.history || []));
      } else {
        state.streak = { streak: 0, lastLog: '', history: [] };
        localStorage.removeItem('limitless_streak');
        localStorage.removeItem('limitless_streak_last_log');
        localStorage.removeItem('limitless_streak_history');
      }
      if (userData.messages) { state.messages = userData.messages; saveMessages(userData.messages); }
      if (userData.limitHitTimeline) { state.limitHitTimeline = userData.limitHitTimeline; localStorage.setItem('limitless_limitHitTimeline', JSON.stringify(userData.limitHitTimeline)); }
      if ('email_alerts' in userData) {
        localStorage.setItem('limitless_email_alerts', userData.email_alerts ? 'on' : 'off');
      }
      if ('ritual_widget_on' in userData) {
        localStorage.setItem('limitless_ritual_widget', userData.ritual_widget_on ? 'on' : 'off');
      }
      if (userData.ritual_today_snapshot) state.ritualSnapshot = userData.ritual_today_snapshot;
      if ('limitless_widget_on' in userData) {
        localStorage.setItem('limitless_widget_on', userData.limitless_widget_on ? 'on' : 'off');
      }
    } catch (e) {
      console.warn('Could not load user data from server, using defaults');
    }
    if (!state.limitHitTimeline.length) {
      try { const c = localStorage.getItem('limitless_limitHitTimeline'); if (c) state.limitHitTimeline = JSON.parse(c); } catch {}
    }
  }

  writeLimitlessSnapshot();

  renderView();
  initNotifications();
  if (typeof window.initStreakUI === 'function') window.initStreakUI();
  setTimeout(() => { if (typeof updateBellState === 'function') updateBellState(); }, 100);

  if (typeof subscribeToRealtime === 'function') {
    let _rtTimer;
    let _rtBusy = false;
    subscribeToRealtime((table) => {
      if (_rtBusy) return;
      clearTimeout(_rtTimer);
      _rtTimer = setTimeout(async () => {
        if (_rtBusy) return;
        _rtBusy = true;
        try {
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
              if (userData.limitHitTimeline) state.limitHitTimeline = userData.limitHitTimeline;
              if (userData.ritual_today_snapshot) state.ritualSnapshot = userData.ritual_today_snapshot;
              if ('ritual_widget_on' in userData) {
                localStorage.setItem('limitless_ritual_widget', userData.ritual_widget_on ? 'on' : 'off');
              }
              if ('limitless_widget_on' in userData) {
                localStorage.setItem('limitless_widget_on', userData.limitless_widget_on ? 'on' : 'off');
              }
              if ('email_alerts' in userData) {
                localStorage.setItem('limitless_email_alerts', userData.email_alerts ? 'on' : 'off');
              }
            } catch (_) {}
            renderView();
          } else if (table === 'poll') {
            await loadAll();
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
              if (userData.limitHitTimeline) state.limitHitTimeline = userData.limitHitTimeline;
              if (userData.ritual_today_snapshot) state.ritualSnapshot = userData.ritual_today_snapshot;
              if ('ritual_widget_on' in userData) {
                localStorage.setItem('limitless_ritual_widget', userData.ritual_widget_on ? 'on' : 'off');
              }
              if ('limitless_widget_on' in userData) {
                localStorage.setItem('limitless_widget_on', userData.limitless_widget_on ? 'on' : 'off');
              }
              if ('email_alerts' in userData) {
                localStorage.setItem('limitless_email_alerts', userData.email_alerts ? 'on' : 'off');
              }
            } catch (_) {}
            renderView();
          }
        } finally {
          _rtBusy = false;
        }
      }, 500);
    });
  }
}

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
    cacheSave('accounts', state.accounts);
    cacheSave('projects', state.projects);
    showOfflineBanner(false);
  } catch (e) {
    console.error('Load error:', e);
    state.loadError = true;
    if (!navigator.onLine) {
      const cachedAccounts = cacheLoad('accounts');
      const cachedProjects = cacheLoad('projects');
      if (cachedAccounts) state.accounts = cachedAccounts;
      if (cachedProjects) state.projects = cachedProjects;
      showOfflineBanner(true);
    } else {
      showError('Failed to load data — tap to retry');
      $('toast')?.addEventListener('click', () => loadAll(), { once: true });
    }
  } finally {
    state.loading = false;
    renderView();
  }
  if (!state.loadError) writeLimitlessSnapshot();
}

function writeLimitlessSnapshot() {
  if (!state.accounts || state.accounts.length === 0) return;
  const total = state.accounts.length;
  const available = state.accounts.filter(a => !isOnCooldown(a)).length;
  const healthScore = Math.round((available / total) * 100);
  const streak = state.streak?.streak || 0;
  if (typeof setUserData === 'function') {
    setUserData('limitless_today_snapshot', {
      healthScore, available, total, streak,
      updatedAt: new Date().toISOString()
    }).catch(e => console.warn('Sync failed:', e));
  }
}

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

function clearLocalStorageSyncKeys() {
  ['limitless_prompts','limitless_account_tags','limitless_cost_prices','limitless_groups','limitless_chats','limitless_notif_history','limitless_streak','limitless_streak_last_log','limitless_streak_history','limitless_messages'].forEach(k => localStorage.removeItem(k));
}
