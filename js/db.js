// ============================================================
//  LIMITLESS — DATABASE LAYER
//  Supabase backend. Email + Google auth.
//  Offline: caches reads to localStorage, queues writes.
// ============================================================

let _sb = null;
let currentUser = null;
let _channels = [];
let _realtimeCallback = null;

// ─── INIT ───────────────────────────────────────────────────
function initSupabase() {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL') return false;
  try {
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        storage: localStorage,
        autoRefreshToken: true,
      },
    });
    window.__sb = _sb;
    return true;
  } catch (e) {
    console.warn('Supabase init failed:', e);
    return false;
  }
}
// ─── AUTH — GOOGLE ───────────────────────────────────────────
async function signInWithGoogle() {
  if (!_sb) throw new Error('Supabase not configured');
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await _sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  });
  if (error) throw error;
}

// ─── AUTH — EMAIL SIGN UP ────────────────────────────────────
async function signUpWithEmail(email, password) {
  if (!_sb) throw new Error('Supabase not configured');
  const redirectTo = window.location.origin + window.location.pathname;
  const { data, error } = await _sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo }
  });
  if (error) throw error;
  return data;
}

// ─── AUTH — EMAIL SIGN IN ────────────────────────────────────
async function signInWithEmail(email, password) {
  if (!_sb) throw new Error('Supabase not configured');
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// ─── AUTH — SIGN OUT ─────────────────────────────────────────
async function signOut() {
  unsubscribeFromRealtime();
  localStorage.removeItem('limitless_logged_in');
  if (_sb) await _sb.auth.signOut();
  currentUser = null;
}

// ─── AUTH — GET SESSION ──────────────────────────────────────
async function getSession() {
  if (!_sb) return null;
  const { data } = await _sb.auth.getSession();
  return data?.session || null;
}

// ─── AUTH — FRESH USER (server-side, not from JWT) ──────────
async function getFreshUser() {
  if (!_sb) return null;
  const { data } = await _sb.auth.getUser();
  return data?.user || null;
}

// ─── AUTH — LISTEN ───────────────────────────────────────────
function onAuthChange(callback) {
  if (!_sb) return;
  _sb.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    callback(session, event);
  });
}

// ─── AUTH — RESET PASSWORD ───────────────────────────────────
async function sendPasswordReset(email) {
  if (!_sb) throw new Error('Supabase not configured');
  const { error } = await _sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href
  });
  if (error) throw error;
}

// ─── PROJECTS ────────────────────────────────────────────────
async function getProjects() {
  if (!_sb || !currentUser) return [];
  const { data, error } = await _sb
    .from('projects')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function saveProject(project) {
  if (!_sb || !currentUser) throw new Error('Not authenticated');
  try {
    if (project.id) {
      const { error } = await _sb.from('projects')
        .update({ name: project.name, description: project.description, color: project.color })
        .eq('id', project.id).eq('user_id', currentUser.id);
      if (error) throw error;
    } else {
      const { error } = await _sb.from('projects')
        .insert({ ...project, user_id: currentUser.id });
      if (error) throw error;
    }
  } catch (e) {
    if (!navigator.onLine) { queueAdd('saveProject', project); return; }
    throw e;
  }
}

async function deleteProject(id) {
  if (!_sb || !currentUser) throw new Error('Not authenticated');
  try {
    await _sb.from('projects').delete().eq('id', id).eq('user_id', currentUser.id);
    // Single atomic update: remove id from project_ids for all affected accounts
    await _sb.rpc('remove_project_from_accounts', { p_user_id: currentUser.id, p_project_id: id });
  } catch (e) {
    if (!navigator.onLine) { queueAdd('deleteProject', id); return; }
    throw e;
  }
}

// ─── LOCAL STORAGE HELPERS (for local-only user data) ──────
function lsGet(key, def) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; } catch { return def; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch {}
}

// ─── USER DATA (jsonb key-value store for cross-device sync) ──
async function loadAllUserData() {
  if (!_sb || !currentUser) return {};
  const { data, error } = await _sb
    .from('user_data')
    .select('key, value')
    .eq('user_id', currentUser.id);
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.key] = row.value;
  return map;
}

async function setUserData(key, value) {
  if (!_sb || !currentUser) throw new Error('Not authenticated');
  const { error } = await _sb
    .from('user_data')
    .upsert({ user_id: currentUser.id, key, value }, { onConflict: 'user_id, key' });
  if (error) throw error;
}

async function deleteUserData(key) {
  if (!_sb || !currentUser) throw new Error('Not authenticated');
  const { error } = await _sb
    .from('user_data')
    .delete()
    .eq('user_id', currentUser.id)
    .eq('key', key);
  if (error) throw error;
}

// ─── ACCOUNTS ────────────────────────────────────────────────
async function getAccounts() {
  if (!_sb || !currentUser) return [];
  const { data, error } = await _sb
    .from('accounts')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function saveAccount(account) {
  if (!_sb || !currentUser) throw new Error('Not authenticated');
  try {
    if (account.id) {
      const { error } = await _sb.from('accounts')
        .update({
          platform: account.platform,
          email: account.email,
          account_type: account.account_type,
          project_ids: account.project_ids || [],
          group_ids: account.group_ids || [],
          note: account.note,
          price: account.price ?? null,
        })
        .eq('id', account.id).eq('user_id', currentUser.id);
      if (error) throw error;
    } else {
      const { error } = await _sb.from('accounts')
        .insert({ ...account, user_id: currentUser.id });
      if (error) throw error;
    }
  } catch (e) {
    if (!navigator.onLine) { queueAdd('saveAccount', account); return; }
    throw e;
  }
}

async function deleteAccount(id) {
  if (!_sb || !currentUser) throw new Error('Not authenticated');
  try {
    const { error } = await _sb.from('accounts').delete().eq('id', id).eq('user_id', currentUser.id);
    if (error) throw error;
  } catch (e) {
    if (!navigator.onLine) { queueAdd('deleteAccount', id); return; }
    throw e;
  }
}

async function logLimit(accountId, resetAt, note) {
  if (!_sb || !currentUser) throw new Error('Not authenticated');
  try {
    const { error } = await _sb.from('accounts')
      .update({ limit_hit_at: new Date().toISOString(), reset_at: resetAt, limit_note: note || null })
      .eq('id', accountId).eq('user_id', currentUser.id);
    if (error) throw error;
  } catch (e) {
    if (!navigator.onLine) { queueAdd('logLimit', { accountId, resetAt, note }); return; }
    throw e;
  }
}

async function clearLimit(accountId) {
  if (!_sb || !currentUser) throw new Error('Not authenticated');
  try {
    const { error } = await _sb.from('accounts')
      .update({ limit_hit_at: null, reset_at: null, limit_note: null })
      .eq('id', accountId).eq('user_id', currentUser.id);
    if (error) throw error;
  } catch (e) {
    if (!navigator.onLine) { queueAdd('clearLimit', accountId); return; }
    throw e;
  }
}
// ─── PROFILE: UPDATE DISPLAY NAME ───────────────────────────
async function updateDisplayName(name) {
  if (!_sb) throw new Error('Not configured');
  const { error } = await _sb.auth.updateUser({ data: { full_name: name, name: name } });
  if (error) throw error;
}

// ─── PROFILE: UPDATE EMAIL ───────────────────────────────────
async function updateEmail(newEmail) {
  if (!_sb) throw new Error('Not configured');
  const { error } = await _sb.auth.updateUser({ email: newEmail });
  if (error) throw error;
}

// ─── PROFILE: UPDATE PASSWORD ────────────────────────────────
async function updatePassword(newPassword) {
  if (!_sb) throw new Error('Not configured');
  const { error } = await _sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ─── PROFILE: DELETE ALL USER DATA ──────────────────────────
async function deleteAllUserData() {
  if (!_sb || !currentUser) throw new Error('Not authenticated');
  // Clear local cache first so it can't repopulate Supabase on next sync
  cacheClear();
  localStorage.removeItem(_QUEUE_KEY);
  await _sb.from('accounts').delete().eq('user_id', currentUser.id);
  await _sb.from('projects').delete().eq('user_id', currentUser.id);
  await _sb.from('user_data').delete().eq('user_id', currentUser.id);
}

// ─── REALTIME — LIVE CROSS-DEVICE SYNC ──────────────────────
function subscribeToRealtime(callback) {
  _realtimeCallback = callback;
  if (!_sb || !currentUser) return;
  const uid = currentUser.id;
  const tables = ['accounts', 'projects', 'user_data'];
  tables.forEach(table => {
    const channel = _sb.channel(`live-${table}-${uid}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${uid}` },
        () => { if (_realtimeCallback) _realtimeCallback(table); }
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') console.warn('Realtime not available for', table, status);
      });
    _channels.push(channel);
  });
}

function unsubscribeFromRealtime() {
  _channels.forEach(ch => _sb?.removeChannel(ch));
  _channels = [];
  _realtimeCallback = null;
}

// ═══════════════════════════════════════════════════════════════
//  OFFLINE CACHE + WRITE QUEUE
// ═══════════════════════════════════════════════════════════════

const _CACHE_PREFIX = 'limit_cache_';
const _QUEUE_KEY = 'limit_write_queue';

function cacheSave(key, data) {
  try { localStorage.setItem(_CACHE_PREFIX + key, JSON.stringify(data)); } catch (_) {}
}
function cacheLoad(key) {
  try { const r = localStorage.getItem(_CACHE_PREFIX + key); return r ? JSON.parse(r) : null; } catch (_) { return null; }
}
function cacheClear() {
  Object.keys(localStorage).filter(k => k.startsWith(_CACHE_PREFIX)).forEach(k => localStorage.removeItem(k));
}

function queueGet() {
  try { return JSON.parse(localStorage.getItem(_QUEUE_KEY) || '[]'); } catch { return []; }
}
function queueSet(q) {
  localStorage.setItem(_QUEUE_KEY, JSON.stringify(q));
}
function queueAdd(action, payload) {
  const q = queueGet();
  q.push({ action, payload, ts: Date.now() });
  queueSet(q);
}
function queueSize() { return queueGet().length; }

async function queueDrain() {
  const q = queueGet();
  if (!q.length) return;
  const kept = [];
  for (const item of q) {
    try {
      switch (item.action) {
        case 'saveAccount':   await _queueSaveAccount(item.payload); break;
        case 'deleteAccount': await _queueDeleteAccount(item.payload); break;
        case 'logLimit':      await _queueLogLimit(item.payload.accountId, item.payload.resetAt, item.payload.note); break;
        case 'clearLimit':    await _queueClearLimit(item.payload); break;
        case 'saveProject':   await _queueSaveProject(item.payload); break;
        case 'deleteProject': await _queueDeleteProject(item.payload); break;
      }
    } catch (_) { kept.push(item); }
  }
  queueSet(kept);
}

// Internal: direct Supabase writes without queue (used by queueDrain)
async function _queueSaveAccount(account) { /* same as saveAccount */ 
  if (!_sb || !currentUser) throw Error('No auth');
  if (account.id) {
    const { error } = await _sb.from('accounts').update({ platform: account.platform, email: account.email, account_type: account.account_type, project_ids: account.project_ids || [], group_ids: account.group_ids || [], note: account.note, price: account.price ?? null }).eq('id', account.id).eq('user_id', currentUser.id);
    if (error) throw error;
  } else {
    const { error } = await _sb.from('accounts').insert({ ...account, user_id: currentUser.id });
    if (error) throw error;
  }
}
async function _queueDeleteAccount(id) {
  if (!_sb || !currentUser) throw Error('No auth');
  const { error } = await _sb.from('accounts').delete().eq('id', id).eq('user_id', currentUser.id);
  if (error) throw error;
}
async function _queueLogLimit(accountId, resetAt, note) {
  if (!_sb || !currentUser) throw Error('No auth');
  const { error } = await _sb.from('accounts').update({ limit_hit_at: new Date().toISOString(), reset_at: resetAt, limit_note: note || null }).eq('id', accountId).eq('user_id', currentUser.id);
  if (error) throw error;
}
async function _queueClearLimit(accountId) {
  if (!_sb || !currentUser) throw Error('No auth');
  const { error } = await _sb.from('accounts').update({ limit_hit_at: null, reset_at: null, limit_note: null }).eq('id', accountId).eq('user_id', currentUser.id);
  if (error) throw error;
}
async function _queueSaveProject(project) {
  if (!_sb || !currentUser) throw Error('No auth');
  if (project.id) {
    const { error } = await _sb.from('projects').update({ name: project.name, description: project.description, color: project.color }).eq('id', project.id).eq('user_id', currentUser.id);
    if (error) throw error;
  } else {
    const { error } = await _sb.from('projects').insert({ ...project, user_id: currentUser.id });
    if (error) throw error;
  }
}
async function _queueDeleteProject(id) {
  if (!_sb || !currentUser) throw Error('No auth');
  await _sb.from('projects').delete().eq('id', id).eq('user_id', currentUser.id);
  await _sb.rpc('remove_project_from_accounts', { p_user_id: currentUser.id, p_project_id: id });
}