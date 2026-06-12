'use strict';

// ─── REPORT ──────────────────────────────────────────────────

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
  const timeline = state.limitHitTimeline || [];
  const limitsHit = timeline.filter(e => {
    const d = new Date(e.date);
    return d >= startOfWeek && d <= endOfWeek;
  }).length;
  const platformsUsed = new Set(state.accounts.map(a => a.platform)).size;
  const days = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    days[d.toISOString().slice(0,10)] = 0;
  }
  timeline.forEach(e => {
    const d = new Date(e.date).toISOString().slice(0,10);
    if (days[d] !== undefined) days[d]++;
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

// ─── HEATMAP ─────────────────────────────────────────────────

let heatmapYearOffset = 0;

function renderHeatmap() {
  const content = document.getElementById('heatmap-content');
  if (!content) return;
  const year = new Date().getFullYear() + heatmapYearOffset;
  document.getElementById('heatmap-year').textContent = year;
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);
  const dayCounts = {};
  (state.limitHitTimeline || []).forEach(e => {
    const d = new Date(e.date).toISOString().slice(0,10);
    dayCounts[d] = (dayCounts[d] || 0) + 1;
  });
  const dates = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }
  const maxCount = Math.max(1, ...Object.values(dayCounts));
  const emptyHtml = '<div class="empty-state"><span class="empty-icon">▦</span><p>Not enough data yet.<br/>Log some limits to see your heatmap.</p></div>';
  if (dates.length === 0 || Object.keys(dayCounts).length === 0) {
    content.innerHTML = emptyHtml;
    return;
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let horizMonthLabels = '<div class="heatmap-month-labels">';
  let horizGrid = '<div class="heatmap-grid">';
  let vertHtml = '';
  let currentMonth = -1;
  let monthCells = [];

  dates.forEach(d => {
    const ds = d.toISOString().slice(0,10);
    const count = dayCounts[ds] || 0;
    const level = count === 0 ? 0 : Math.min(5, Math.ceil((count / maxCount) * 5));
    const title = `${ds}: ${count} limit${count !== 1 ? 's' : ''}`;
    const cellHtml = `<div class="heatmap-cell" data-level="${level}" title="${title}"></div>`;

    horizGrid += cellHtml;

    if (d.getMonth() !== currentMonth) {
      if (currentMonth >= 0) {
        vertHtml += `<div class="hmv-row"><span class="hmv-month">${MONTHS[currentMonth]}</span><div class="hmv-cells">${monthCells.join('')}</div></div>`;
      }
      currentMonth = d.getMonth();
      monthCells = [];
      horizMonthLabels += `<span class="heatmap-month-label">${MONTHS[currentMonth]}</span>`;
    }
    monthCells.push(cellHtml);
  });
  if (currentMonth >= 0) {
    vertHtml += `<div class="hmv-row"><span class="hmv-month">${MONTHS[currentMonth]}</span><div class="hmv-cells">${monthCells.join('')}</div></div>`;
  }
  horizMonthLabels += '</div>';
  horizGrid += '</div>';

  const legendHtml = `<div class="heatmap-legend">Less <span class="heatmap-legend-swatch l0"></span><span class="heatmap-legend-swatch l1"></span><span class="heatmap-legend-swatch l2"></span><span class="heatmap-legend-swatch l3"></span><span class="heatmap-legend-swatch l4"></span><span class="heatmap-legend-swatch l5"></span> More</div>`;

  content.innerHTML = `<div class="heatmap-horiz">${horizMonthLabels}${horizGrid}</div><div class="heatmap-vert">${vertHtml}</div>${legendHtml}`;
}

// ─── COST ────────────────────────────────────────────────────

function renderCost() {
  const totalEl = document.getElementById('cost-total');
  const freeEl = document.getElementById('cost-free-count');
  const proEl = document.getElementById('cost-pro-count');
  const breakdown = document.getElementById('cost-breakdown');
  if (!totalEl) return;
  const paidAccounts = state.accounts.filter(a => isPaidType(a.account_type));
  const freeAccounts = state.accounts.filter(a => !isPaidType(a.account_type));
  const prices = loadCostPrices();
  let total = 0;
  const platCosts = {};
  state.accounts.forEach(a => {
    if (isPaidType(a.account_type)) {
      const cost = a.price ?? prices[a.platform] ?? 20;
      platCosts[a.platform] = (platCosts[a.platform] || 0) + cost;
      total += cost;
    }
  });
  totalEl.textContent = `$${total}`;
  freeEl.textContent = freeAccounts.length;
  proEl.textContent = paidAccounts.length;
  if (paidAccounts.length === 0) {
    breakdown.innerHTML = '<div class="report-empty" style="padding:1rem">No paid accounts yet</div>';
  } else {
    breakdown.innerHTML = Object.entries(platCosts).map(([plat, cost]) => {
      const color = PLATFORM_COLORS[plat] || '#888';
      const count = paidAccounts.filter(a => a.platform === plat).length;
      return `<div class="cost-row"><span class="cost-row-dot" style="background:${color}"></span><span class="cost-row-name">${escHtml(plat)}</span><span class="cost-row-type">${count} paid</span><span class="cost-row-amt">$${cost}</span></div>`;
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
  const allPlatforms = [...new Set([...state.accounts.filter(a => isPaidType(a.account_type)).map(a => a.platform), ...Object.keys(DEFAULT_PRICES)])];
  grid.innerHTML = allPlatforms.map(p => `
    <div class="cost-edit-field">
      <label>${escHtml(p)}</label>
      <input type="number" class="cost-price-input" data-platform="${escHtml(p)}" value="${prices[p] || DEFAULT_PRICES[p] || 20}" min="0" step="0.01" />
    </div>`).join('');
}

// ─── TIMELINE ────────────────────────────────────────────────

let tlWindowHours = 6;

function renderTimeline() {
  const now = new Date();
  const windowMs = tlWindowHours * 3600000;
  const windowEnd = new Date(now.getTime() + windowMs);

  const ready    = state.accounts.filter(a => !isOnCooldown(a));
  const cooling  = state.accounts.filter(a => isOnCooldown(a));
  const inWindow = cooling.filter(a => new Date(a.reset_at) <= windowEnd);
  const outside  = cooling.filter(a => new Date(a.reset_at) > windowEnd);

  const emptyEl = $('tl-empty');
  if (emptyEl) emptyEl.classList.toggle('hidden', cooling.length > 0);

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

  const track = $('tl-track');
  if (!track) return;

  Array.from(track.children).forEach(c => {
    if (!c.classList.contains('tl-now-line')) c.remove();
  });

  const numTicks2 = tlWindowHours <= 6 ? tlWindowHours : (tlWindowHours <= 12 ? 6 : 8);
  for (let i = 1; i < numTicks2; i++) {
    const tick = document.createElement('div');
    tick.className = 'tl-tick';
    tick.style.left = ((i / numTicks2) * 100) + '%';
    track.appendChild(tick);
  }

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

      pill.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = pill.classList.contains('tip-open');
        document.querySelectorAll('.tl-pill.tip-open').forEach(p => p.classList.remove('tip-open'));
        if (!isOpen) pill.classList.add('tip-open');
      });
      track.appendChild(pill);
    });
  });

  track.style.minHeight = Math.max(90, 24 + rows.length * 52 + 28) + 'px';

  const legendEl = $('tl-legend');
  if (legendEl) {
    legendEl.innerHTML = outside.length > 0
      ? `<div class="tl-legend-item"><span class="tl-legend-icon">◌</span><span>${outside.length} account${outside.length !== 1 ? 's' : ''} reset after the ${tlWindowHours}h window — increase window to see them</span></div>`
      : '';
  }

  setTimeout(() => {
    document.addEventListener('click', () => {
      document.querySelectorAll('.tl-pill.tip-open').forEach(p => p.classList.remove('tip-open'));
    }, { once: true });
  }, 0);
}
