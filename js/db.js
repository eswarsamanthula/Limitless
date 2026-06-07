// ============================================================
//  LIMITLESS — DATABASE LAYER
//  Supabase backend. Email + Google auth. No localStorage demo.
// ============================================================

let _sb = null;
let currentUser = null;

// ─── INIT ───────────────────────────────────────────────────
function initSupabase() {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL') return false;
  try {
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  } catch (e) {
    console.warn('Supabase init failed:', e);
    return false;
  }
}

// ─── AUTH — GOOGLE ───────────────────────────────────────────
async function signInWithGoogle() {
  if (!_sb) throw new Error('Supabase not configured');
  const { error } = await _sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  });
  if (error) throw error;
}

// ─── AUTH — EMAIL SIGN UP ────────────────────────────────────
async function signUpWithEmail(email, password) {
  if (!_sb) throw new Error('Supabase not configured');
  const { data, error } = await _sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.href }
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
}

async function deleteProject(id) {
  if (!_sb || !currentUser) throw new Error('Not authenticated');
  await _sb.from('projects').delete().eq('id', id).eq('user_id', currentUser.id);
  // Note: project_ids arrays in accounts will retain the deleted id but it will
  // simply not resolve to a project anymore — harmless. Or clean up:
  const { data: accs } = await _sb.from('accounts').select('id, project_ids').eq('user_id', currentUser.id);
  for (const acc of accs || []) {
    const ids = (acc.project_ids || []).filter(pid => pid !== id);
    if (ids.length !== (acc.project_ids || []).length) {
      await _sb.from('accounts').update({ project_ids: ids }).eq('id', acc.id);
    }
  }
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
  if (account.id) {
    const { error } = await _sb.from('accounts')
      .update({
        platform: account.platform,
        email: account.email,
        account_type: account.account_type,
        project_ids: account.project_ids || [],
        note: account.note,
      })
      .eq('id', account.id).eq('user_id', currentUser.id);
    if (error) throw error;
  } else {
    const { error } = await _sb.from('accounts')
      .insert({ ...account, user_id: currentUser.id });
    if (error) throw error;
  }
}

async function deleteAccount(id) {
  if (!_sb || !currentUser) throw new Error('Not authenticated');
  const { error } = await _sb.from('accounts').delete().eq('id', id).eq('user_id', currentUser.id);
  if (error) throw error;
}

async function logLimit(accountId, resetAt, note) {
  if (!_sb || !currentUser) throw new Error('Not authenticated');
  const { error } = await _sb.from('accounts')
    .update({ limit_hit_at: new Date().toISOString(), reset_at: resetAt, limit_note: note || null })
    .eq('id', accountId).eq('user_id', currentUser.id);
  if (error) throw error;
}

async function clearLimit(accountId) {
  if (!_sb || !currentUser) throw new Error('Not authenticated');
  const { error } = await _sb.from('accounts')
    .update({ limit_hit_at: null, reset_at: null, limit_note: null })
    .eq('id', accountId).eq('user_id', currentUser.id);
  if (error) throw error;
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
  await _sb.from('accounts').delete().eq('user_id', currentUser.id);
  await _sb.from('projects').delete().eq('user_id', currentUser.id);
  await _sb.from('user_data').delete().eq('user_id', currentUser.id);
}