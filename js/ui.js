'use strict';

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

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toDatetimeLocalValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function showSkeletons(grid, count = 4) {
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

function showSessionBanner() {
  const banner = $('session-banner');
  if (banner) banner.classList.remove('hidden');
}
function hideSessionBanner() {
  const banner = $('session-banner');
  if (banner) banner.classList.add('hidden');
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('open');
  const backdrop = modal.closest('.modal-backdrop') || modal.querySelector('.modal-backdrop');
  if (backdrop) backdrop.classList.add('open');
  document.body.classList.add('modal-open');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  const backdrop = modal.closest('.modal-backdrop') || modal.querySelector('.modal-backdrop');
  if (backdrop) backdrop.classList.remove('open');
  document.body.classList.remove('modal-open');
}

function openSidebar() {
  const sidebar = $('sidebar');
  const overlay = $('sidebar-overlay');
  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('open');
  document.body.classList.add('sidebar-open');
}

function closeSidebar() {
  const sidebar = $('sidebar');
  const overlay = $('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  document.body.classList.remove('sidebar-open');
}

// ─── PULL-TO-REFRESH ───────────────────────────────────────────
const _ptr = { pulling: false, startY: 0, pullDist: 0, threshold: 80, refreshing: false };

function ptrInit() {
  document.addEventListener('touchstart', ptrTouchStart, { passive: true });
  document.addEventListener('touchmove', ptrTouchMove, { passive: false });
  document.addEventListener('touchend', ptrTouchEnd, { passive: true });
}

function ptrTouchStart(e) {
  const scrollEl = document.scrollingElement || document.documentElement;
  if (scrollEl.scrollTop !== 0 || _ptr.refreshing) return;
  _ptr.pulling = true;
  _ptr.startY = e.touches[0].clientY;
  _ptr.pullDist = 0;
}

function ptrTouchMove(e) {
  if (!_ptr.pulling) return;
  const y = e.touches[0].clientY;
  let dist = y - _ptr.startY;
  if (dist < 0) { _ptr.pulling = false; ptrReset(); return; }
  if (dist > 50) dist = 50 + (dist - 50) * 0.45;
  _ptr.pullDist = dist;
  const pct = Math.min(dist / _ptr.threshold, 1);
  const overlay = $('ptr-overlay');
  const ring = $('ptr-ring-fill');
  if (overlay) {
    overlay.classList.remove('ptr-hidden');
    overlay.classList.add('ptr-visible');
    overlay.style.transform = `translateY(${dist}px)`;
  }
  if (ring) {
    const circ = 125.66;
    ring.style.strokeDashoffset = String(circ * (1 - pct));
  }
  const label = $('ptr-label');
  if (label) label.textContent = pct >= 1 ? 'Release to refresh' : 'Pull to refresh';
  if (pct >= 1) e.preventDefault();
}

function ptrTouchEnd() {
  if (!_ptr.pulling) return;
  _ptr.pulling = false;
  if (_ptr.pullDist >= _ptr.threshold) ptrRefresh();
  else ptrReset();
}

async function ptrRefresh() {
  _ptr.refreshing = true;
  const label = $('ptr-label');
  if (label) label.textContent = 'Refreshing…';
  const ring = $('ptr-ring-fill');
  if (ring) { ring.style.strokeDashoffset = '0'; ring.style.transition = 'stroke-dashoffset .3s ease'; }
  const overlay = $('ptr-overlay');
  if (overlay) {
    overlay.style.transform = 'translateY(80px)';
    overlay.classList.add('ptr-refreshing');
  }
  try {
    if (typeof queueDrain === 'function') await queueDrain();
    if (currentUser) await loadAll({ silent: true });
    renderView();
    showSuccess('Refreshed ✓');
  } catch (_) {
    showError('Refresh failed');
  }
  setTimeout(ptrReset, 500);
}

function ptrReset() {
  _ptr.refreshing = false;
  const overlay = $('ptr-overlay');
  const ring = $('ptr-ring-fill');
  const label = $('ptr-label');
  if (overlay) {
    overlay.style.transform = '';
    overlay.classList.remove('ptr-visible', 'ptr-refreshing');
    overlay.classList.add('ptr-hidden');
  }
  if (ring) {
    ring.style.strokeDashoffset = '125.66';
    ring.style.transition = 'stroke-dashoffset .35s cubic-bezier(.34,1.56,.64,1)';
  }
  if (label) label.textContent = 'Pull to refresh';
}

// ─── OFFLINE / ONLINE ───────────────────────────────────────────
window.addEventListener('offline', () => showOfflineBanner(true));
window.addEventListener('online',  async () => {
  showOfflineBanner(false);
  await queueDrain();
  await loadAll({ silent: true });
  renderView();
  const q = queueSize();
  showSuccess(q > 0 ? `${q} change${q > 1 ? 's' : ''} pending sync` : 'Back online — refreshed ✓');
});
