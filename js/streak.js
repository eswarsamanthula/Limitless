'use strict';

// ─── USAGE STREAKS ──────────────────────────────────────────

(function initStreaks() {
  const STREAK_KEY     = 'limitless_streak';
  const LAST_LOG_KEY   = 'limitless_streak_last_log';
  const HISTORY_KEY    = 'limitless_streak_history';

  function todayStr() {
    return new Date().toLocaleDateString('sv-SE');
  }

  function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('sv-SE');
  }

  function getStreakData() {
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

  function recordActivity() {
    const today = todayStr();
    const data  = getStreakData();

    if (data.lastLog === today) return data.streak;

    let newStreak;
    if (data.lastLog === yesterdayStr()) {
      newStreak = data.streak + 1;
    } else {
      newStreak = 1;
    }

    const history = data.history.filter(d => d !== today);
    history.push(today);
    const trimmed = history.slice(-90);

    saveStreakData({ streak: newStreak, lastLog: today, history: trimmed });
    renderStreakEverywhere(newStreak, trimmed);

    if ([3, 7, 14, 30, 60, 90].includes(newStreak)) {
      setTimeout(() => showSuccess(`🔥 ${newStreak}-day streak! Keep it up!`), 400);
    }

    return newStreak;
  }

  window.recordStreakActivity = recordActivity;

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

  function streakMeta(streak) {
    if (streak === 0)  return { label: '○', cls: 'tier-zero' };
    if (streak < 3)    return { label: '🔥', cls: 'tier-low' };
    if (streak < 7)    return { label: '🔥', cls: 'tier-mid' };
    if (streak < 14)   return { label: '🔥', cls: 'tier-high' };
    if (streak < 30)   return { label: '🔥', cls: 'tier-epic' };
    return               { label: '🔥', cls: 'tier-legendary' };
  }

  function renderStreakEverywhere(streak, history) {
    renderStreakPill(streak);
    renderStreakStatCard(streak, history);
  }

  window.initStreakUI = function () {
    const data = getStreakData();
    const today = todayStr();
    const yesterday = yesterdayStr();
    let currentStreak = data.streak;
    if (data.lastLog && data.lastLog !== today && data.lastLog !== yesterday) {
      currentStreak = 0;
      saveStreakData({ streak: 0, lastLog: data.lastLog, history: data.history });
    }
    renderStreakEverywhere(currentStreak, data.history);
  };
})();

// ─── COUNTDOWN TICK ─────────────────────────────────────────

function startGlobalCountdownTick() {
  setInterval(() => {
    document.querySelectorAll('.countdown[data-reset]').forEach(el => {
      const resetAt = new Date(el.dataset.reset);
      const diff = resetAt - new Date();
      if (diff <= 0) {
        const accountId = el.closest('.account-card')?.dataset.accountId;
        if (accountId) triggerResetPulse(accountId);
        setTimeout(() => { loadAll().then(renderView); scheduleResetCheck(); }, 600);
      } else {
        el.textContent = formatCountdown(diff);
      }
    });
  }, 1000);
}

function scheduleResetCheck() {}

// ─── SHAREABLE STREAK CARD ──────────────────────────────────

async function generateStreakCard() {
  const w = 600, h = 400, dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const isDark = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#0d0d0b';
  const bg1 = isDark ? '#1a1916' : '#f5f3ee';
  const bg2 = isDark ? '#0d0d0b' : '#eceae4';
  const text = isDark ? '#f0ede6' : '#1a1916';
  const muted = isDark ? '#8a8780' : '#7a7670';
  const accent = isDark ? '#f0ede6' : '#1a1916';
  const ringTrack = isDark ? '#2a2a26' : '#ddd9d0';

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, bg1);
  grad.addColorStop(1, bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const fontMono = 'Geist Mono';
  const fontDisplay = 'Instrument Serif';

  await document.fonts.ready;

  ctx.fillStyle = accent;
  ctx.font = `600 14px "${fontMono}", monospace`;
  ctx.fillText('LIMITLESS', 40, 50);

  const streak = state.streak?.streak || 0;
  ctx.fillStyle = text;
  ctx.font = `500 72px "${fontDisplay}", serif`;
  ctx.fillText(String(streak), 40, 175);
  ctx.font = `400 14px "${fontMono}", monospace`;
  ctx.fillStyle = muted;
  ctx.fillText('day streak', 40, 205);

  const total = state.accounts.length;
  const available = state.accounts.filter(a => !isOnCooldown(a)).length;
  const pct = total > 0 ? Math.round((available / total) * 100) : 0;

  const cx = 460, cy = 130, r = 75;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = ringTrack;
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (pct / 100) * 2 * Math.PI);
  ctx.strokeStyle = pct >= 80 ? '#4ade80' : (pct >= 50 ? '#fbbf24' : '#f87171');
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.fillStyle = text;
  ctx.font = `500 32px "${fontDisplay}", serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`${pct}%`, cx, cy + 6);
  ctx.textAlign = 'left';
  ctx.font = `400 12px "${fontMono}", monospace`;
  ctx.fillStyle = muted;
  ctx.textAlign = 'center';
  ctx.fillText('available', cx, cy + 30);
  ctx.textAlign = 'left';

  const statY = 290;
  const stats = [
    { label: 'Accounts', value: String(total) },
    { label: 'Available', value: String(available) },
    { label: 'Cooldown', value: String(state.accounts.filter(a => isOnCooldown(a)).length) },
  ];
  const statW = 160;
  stats.forEach((s, i) => {
    const x = 40 + i * statW;
    ctx.fillStyle = text;
    ctx.font = `500 28px "${fontDisplay}", serif`;
    ctx.fillText(s.value, x, statY);
    ctx.fillStyle = muted;
    ctx.font = `400 11px "${fontMono}", monospace`;
    ctx.fillText(s.label, x, statY + 22);
  });

  ctx.fillStyle = muted;
  ctx.font = `400 10px "${fontMono}", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(new Date().toISOString().slice(0, 10), 40, 380);

  return canvas;
}

async function shareStreakCard() {
  try {
    const canvas = await generateStreakCard();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) { showError('Failed to generate card'); return; }
    const file = new File([blob], `limitless-streak-${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ title: 'My Limitless Streak', text: 'Check out my AI limit streak!', files: [file] });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess('Card downloaded ✓');
    }
  } catch (e) {
    if (e.name !== 'AbortError') showError('Share failed');
  }
}
