'use strict';

function isOnCooldown(account) {
  if (!account.reset_at) return false;
  return new Date(account.reset_at) > new Date();
}
window.isOnCooldown = isOnCooldown;

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
          ${escHtml(account.account_type?.toUpperCase() || 'FREE')}
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

  const statusLabel = cooldown ? 'On Cooldown' : 'Available';
  const statusDot = cooldown ? '●' : '●';
  const typeTagHtml = typeTag(account.account_type);

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
      ${typeTagHtml}
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

function filterAccounts(accounts, filter) {
  if (filter === 'available') return accounts.filter(a => !isOnCooldown(a));
  if (filter === 'cooldown') return accounts.filter(a => isOnCooldown(a));
  if (filter === 'free') return accounts.filter(a => a.account_type === 'free');
  if (filter === 'pro') return accounts.filter(a => isPaidType(a.account_type));
  if (state.groupFilter) return state.groupFilter === 'none'
    ? accounts.filter(a => !a.group_ids || a.group_ids.length === 0)
    : accounts.filter(a => (a.group_ids || []).includes(state.groupFilter));
  return accounts;
}

// ─── MODALS: ACCOUNT ───────────────────────────────────────────

function openAccountModal(accountId = null) {
  state.editingAccountId = accountId;
  const account = accountId ? state.accounts.find(a => a.id === accountId) : null;

  $('modal-account-title').textContent = account ? 'Edit Account' : 'Add Account';
  $('account-id').value = accountId || '';
  $('account-email').value = account?.email || '';
  $('account-note').value = account?.note || '';

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

  const type = account?.account_type || 'free';
  state.selectedAccountType = ['free','pro'].includes(type) ? type : 'other';
  $$('.toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === state.selectedAccountType);
  });
  const custWrapper = document.getElementById('custom-type-wrapper');
  const custInput = document.getElementById('custom-account-type');
  if (custWrapper) custWrapper.classList.toggle('hidden', state.selectedAccountType !== 'other');
  if (custInput && !['free','pro'].includes(type)) custInput.value = type;
  else if (custInput) custInput.value = '';

  const priceWrapper = document.getElementById('account-price-wrapper');
  const priceInput = document.getElementById('account-price');
  if (priceWrapper) priceWrapper.classList.toggle('hidden', state.selectedAccountType === 'free');
  if (priceInput) priceInput.value = account?.price ?? '';

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
    account_type: state.selectedAccountType === 'other'
      ? (document.getElementById('custom-account-type')?.value.trim() || 'free')
      : state.selectedAccountType,
    project_ids: Array.from($('account-projects-list').querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value),
    group_ids: Array.from($('account-groups-list').querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value),
    note: $('account-note').value.trim() || null,
    price: document.getElementById('account-price')?.value
      ? parseFloat(document.getElementById('account-price').value)
      : null,
  };

  try {
    await saveAccount(account);
    await loadAll();
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
    if (state.accounts.length === 0 && state.streak?.streak > 0) {
      state.streak = { streak: 0, lastLog: '', history: [] };
      localStorage.setItem('limitless_streak', '0');
      localStorage.setItem('limitless_streak_last_log', '');
      localStorage.setItem('limitless_streak_history', '[]');
      if (typeof setUserData === 'function') setUserData('streak', state.streak).catch(e => console.warn('Sync failed:', e));
    }
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

  const hours = PLATFORM_RESET_HOURS[account.platform] || 3;
  const suggested = new Date(Date.now() + hours * 3600000);
  $('reset-datetime').value = toDatetimeLocalValue(suggested);

  $$('.quick-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('#modal-limit .reason-chip').forEach(c => c.classList.remove('selected'));
  $('limit-note').style.display = 'none';
  $('limit-note').value = '';

  openModal('modal-limit');
}

async function handleSaveLimit() {
  haptic();
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

    const acct = state.accounts.find(a => a.id === accountId);
    if (acct) {
      const entry = { accountId, platform: acct.platform, email: acct.email, date: new Date().toISOString(), note };
      state.limitHitTimeline = [...(state.limitHitTimeline || []), entry];
      localStorage.setItem('limitless_limitHitTimeline', JSON.stringify(state.limitHitTimeline));
      if (typeof setUserData === 'function') {
        setUserData('limitHitTimeline', state.limitHitTimeline).catch(e => console.warn('Sync failed:', e));
      }
    }

    if (typeof window.recordStreakActivity === 'function') window.recordStreakActivity();
    await loadAll();
    renderView();
    closeModal('modal-limit');
    showSuccess('Limit logged ⏱');
    if (acct) scheduleNotification(acct, new Date(resetAt));
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

// ─── BULK IMPORT ─────────────────────────────────────────────

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
    const raw = (parts[2] || 'free').toLowerCase();
    const type = raw === 'pro' ? 'pro' : raw === 'free' ? 'free' : raw;
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

// ─── TAGS ────────────────────────────────────────────────────

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
  if (typeof setUserData === 'function') setUserData('accountTags', all).catch(e => console.warn('Sync failed:', e));
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

// ─── PROJECTS ─────────────────────────────────────────────────

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

// ─── GROUPS ──────────────────────────────────────────────────

function loadGroups() {
  if (state.groups.length) return state.groups;
  try { return JSON.parse(localStorage.getItem('limitless_groups') || '[]'); }
  catch { return []; }
}

function saveGroups(groups) {
  state.groups = groups;
  localStorage.setItem('limitless_groups', JSON.stringify(groups));
  if (typeof setUserData === 'function') setUserData('groups', groups).catch(e => console.warn('Sync failed:', e));
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
    return `<div class="group-card" style="--grp-color:${g.color || '#6ee7b7'}">
      <div class="group-card-main" onclick="filterByGroup('${g.id}')">
        <div class="group-card-name">${escHtml(g.name)}</div>
        <div class="group-card-count">${count} account${count !== 1 ? 's' : ''}</div>
      </div>
      <div class="group-card-actions">
        <button class="group-action-btn" onclick="event.stopPropagation();openGroupModal('${g.id}')" title="Edit">✎</button>
        <button class="group-action-btn danger" onclick="event.stopPropagation();deleteGroup('${g.id}')" title="Delete">✕</button>
      </div>
    </div>`;
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
    groups.push({ id: crypto.randomUUID(), name, color, account_ids: [] });
  }
  saveGroups(groups);
  closeModal('modal-group');
  if (state.currentView === 'groups') renderGroupsView();
  showToast(id ? 'Group updated' : 'Group created');
}

function deleteGroup(id) {
  const groups = loadGroups();
  const group = groups.find(g => g.id === id);
  if (!group || !confirm(`Delete "${group.name}"?`)) return;
  saveGroups(groups.filter(g => g.id !== id));
  renderGroupsView();
  showToast('Group deleted');
}

function filterByGroup(groupId) {
  state.groupFilter = groupId;
  state.filter = 'all';
  const groups = loadGroups();
  const group = groups.find(g => g.id === groupId);
  switchView('dashboard');
  showToast(`Showing: ${group ? escHtml(group.name) : 'Group'}`);
  $$('.filter-btn').forEach(b => b.classList.remove('active'));
  const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
  if (allBtn) allBtn.classList.add('active');
}

// ─── ROTATION PLANNER ────────────────────────────────────────

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
      <span class="rotation-status">${typeTag(a.account_type)}</span>
    </div>`;
  }).join('');
}

// ─── RESET PULSE ─────────────────────────────────────────────

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

// ─── FORMAT COUNTDOWN ────────────────────────────────────────

function formatCountdown(ms) {
  if (ms <= 0) return 'Ready';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function scheduleResetCheck() {}
