'use strict';

function renderDashboard() {
  const accounts = filterAccounts(Array.isArray(state.accounts) ? state.accounts : [], state.filter);

  const total = Array.isArray(state.accounts) ? state.accounts.length : 0;
  const cooling = Array.isArray(state.accounts) ? state.accounts.filter(a => isOnCooldown(a)).length : 0;
  const available = total - cooling;

  $('stat-total').textContent = total;
  $('stat-available').textContent = available;
  $('stat-cooling').textContent = cooling;

  const grid = $('accounts-grid');
  const empty = $('empty-dashboard') || (() => {
    const el = document.createElement('div');
    el.id = 'empty-dashboard';
    el.className = 'empty-state';
    el.innerHTML = `<span class="empty-icon">◎</span><p>No accounts yet.<br/>Add your first AI account to start tracking.</p><button class="btn-primary" id="empty-add-btn" onclick="openAccountModal()">+ Add Account</button>`;
    return el;
  })();

  if (accounts.length === 0) {
    grid.innerHTML = '';
    grid.appendChild(empty);
  } else {
    if (grid.contains(empty)) empty.remove();
    grid.innerHTML = '';
    accounts.forEach((account, i) => {
      const card = buildAccountCard(account, i);
      addPredictionToCard(card, account);
      renderTagsOnCard(card, account.id);
      grid.appendChild(card);
    });
  }

  renderHealthRing();
  renderPlatformPie();
  renderReasonAnalytics();
  renderSmartSuggestion();
}

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

function renderHealthRing() {
  const svg = document.getElementById('health-ring-svg');
  const scoreEl = document.getElementById('health-score');
  const subEl = document.getElementById('health-sub');
  if (!svg || !scoreEl) return;
  const total = Array.isArray(state.accounts) ? state.accounts.length : 0;
  if (total === 0) {
    scoreEl.textContent = '—';
    subEl.textContent = 'No accounts';
    svg.innerHTML = '';
    return;
  }
  const available = Array.isArray(state.accounts) ? state.accounts.filter(a => !isOnCooldown(a)).length : 0;
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
  scoreEl.textContent = `${Number.isFinite(available) ? available : 0}/${Number.isFinite(total) ? total : 0}`;
  subEl.textContent = pct >= 80 ? 'Great shape' : pct >= 50 ? 'Some cooldowns' : 'Heavy usage';
}

function renderReasonAnalytics() {
  const container = document.getElementById('reason-bars');
  if (!container) return;
  const today = new Date().toISOString().slice(0, 10);
  const todaysHits = (state.limitHitTimeline || []).filter(e => e.date.slice(0, 10) === today);
  const reasons = {};
  todaysHits.forEach(e => { const note = e.note || 'No reason'; reasons[note] = (reasons[note] || 0) + 1; });
  const entries = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    container.innerHTML = '<span style="font-size:0.75rem;color:var(--text-faint);font-style:italic">No limits hit today</span>';
    return;
  }
  const maxCount = entries[0][1];
  const total = todaysHits.length;
  const ICONS = { Message:'💬', Image:'🖼', Code:'⌨', Search:'🔍' };
  container.innerHTML = `<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.5rem;font-weight:600">${total} limit${total!==1?'s':''} hit today</div>` + entries.map(([reason, count]) => {
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

function addPredictionToCard(card, account) {
  if (!account.limit_hit_at || !account.reset_at) return;
  const hitTime = new Date(account.limit_hit_at).getTime();
  const resetTime = new Date(account.reset_at).getTime();
  if (hitTime <= 0 || resetTime <= 0) return;
  const duration = resetTime - hitTime;
  if (duration <= 0) return;
  if (isOnCooldown(account)) return;
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

// ─── SETTINGS ─────────────────────────────────────────────────

function renderSettings() {
  const name = $('user-name')?.textContent || '';
  const emailDisplay = currentUser?.email || '';

  const dispName = $('settings-display-name');
  const dispEmail = $('settings-email-display');
  if (dispName) dispName.textContent = name;
  if (dispEmail) dispEmail.textContent = emailDisplay;

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

  const nameInput = $('settings-name-input');
  if (nameInput) nameInput.value = name;

  const currentEmailDisplay = $('settings-current-email-display');
  if (currentEmailDisplay) currentEmailDisplay.textContent = emailDisplay || '—';
  const emailInput = $('settings-new-email');
  if (emailInput) { emailInput.value = ''; emailInput.placeholder = 'Enter new email…'; }

  const savedTheme = localStorage.getItem('limitless_theme') || 'auto';
  document.querySelectorAll('[data-theme-pick]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themePick === savedTheme);
  });

  const emailToggle = $('settings-email-toggle');
  if (emailToggle) {
    const emailState = localStorage.getItem('limitless_email_alerts') ?? 'off';
    if (emailState === 'off') {
      emailToggle.textContent = 'OFF';
      emailToggle.className = 'btn-ghost small danger';
    } else {
      emailToggle.textContent = 'ON';
      emailToggle.className = 'btn-ghost small';
    }
  }

  const ritualToggle = $('settings-ritual-toggle');
  if (ritualToggle) {
    const ritualState = localStorage.getItem('limitless_ritual_widget') ?? 'off';
    if (ritualState === 'off') {
      ritualToggle.textContent = 'OFF';
      ritualToggle.className = 'btn-ghost small danger';
    } else {
      ritualToggle.textContent = 'ON';
      ritualToggle.className = 'btn-ghost small';
    }
  }

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
    const type = a.account_type === 'pro' ? 'Pro' : a.account_type === 'free' ? 'Free' : a.account_type;
    return `${a.platform} [${type}] ${a.email || '—'} — ${status}`;
  });

  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `AI Account Status — ${date} ${now}\n${'─'.repeat(36)}\n${lines.join('\n')}`;
}

function renderRitualWidget() {
  const widget = $('ritual-widget');
  if (!widget) return;
  if (localStorage.getItem('limitless_ritual_widget') !== 'on' || !state.ritualSnapshot) {
    widget.classList.add('hidden');
    return;
  }
  widget.classList.remove('hidden');
  const s = state.ritualSnapshot;
  const available = Array.isArray(state.accounts) ? state.accounts.filter(a => !isOnCooldown(a)).length : 0;
  const total = Array.isArray(state.accounts) ? state.accounts.length : 0;
  const color = available >= Math.ceil(total * 0.8) ? 'var(--green)' : available >= Math.ceil(total * 0.5) ? 'var(--amber)' : 'var(--red)';
  widget.innerHTML = `
    <div class="ritual-widget-header">
      <span class="ritual-widget-icon">◎</span>
      <span class="ritual-widget-title">Limitless</span>
    </div>
    <div class="ritual-widget-body">
      <span class="ritual-widget-stat" style="color:${color}">${Number.isFinite(available) ? available : 0}/${Number.isFinite(total) ? total : 0} available</span>
      <span class="ritual-widget-streak">🔥 ${s.streak || 0} day streak</span>
    </div>
  `;
}

// ─── MODEL COMPARISON TABLE ────────────────────────────────────

const MODEL_DATA = [
  { platform: 'Claude', free_limit: '~20 msgs / 5 hrs (Sonnet)', pro_limit: '~100 msgs / 5 hrs (Opus)', context: '200K tokens', free_cost: 'Free', pro_cost: '$20 / mo', reset: '5 hours' },
  { platform: 'ChatGPT', free_limit: '~10–15 msgs / 3 hrs (GPT-4o)', pro_limit: '80 msgs / 3 hrs (GPT-4o)', context: '128K tokens', free_cost: 'Free', pro_cost: '$20 / mo', reset: '3 hours' },
  { platform: 'Gemini', free_limit: '~60 msgs / day (Gemini 1.5 Pro)', pro_limit: '~1000 msgs / day', context: '1M tokens', free_cost: 'Free', pro_cost: '$19.99 / mo', reset: '24 hours' },
  { platform: 'Grok', free_limit: '~10 msgs / 2 hrs (Grok-2)', pro_limit: '~100 msgs / 2 hrs', context: '131K tokens', free_cost: 'Free (X account)', pro_cost: '$8–$16 / mo', reset: '2 hours' },
  { platform: 'Copilot', free_limit: '~30 turns / day', pro_limit: 'Higher priority, faster', context: '~16K tokens', free_cost: 'Free (Microsoft account)', pro_cost: '$20 / mo', reset: '24 hours' },
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
