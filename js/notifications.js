// ============================================================
//  LIMITLESS — NOTIFICATIONS
//  Browser push + email notifications for limit resets.
// ============================================================

let notifPermission = Notification?.permission || 'default';
let _userEmail = '';

function setNotifUserEmail(email) { _userEmail = email; }

// ─── INIT ────────────────────────────────────────────────────
function initNotifications() {
  if (!('Notification' in window)) return;

  notifPermission = Notification.permission;

  // Only init EmailJS if email alerts are not turned off
  if (typeof emailjs !== 'undefined' && localStorage.getItem('limitless_email_alerts') !== 'off') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }

  const dismissed = localStorage.getItem('limitless_notif_dismissed');
  if (notifPermission === 'default' && !dismissed) {
    const banner = document.getElementById('notif-banner');
    if (banner) banner.classList.remove('hidden');
  }

  // Reschedule any pending resets from saved state
  rescheduleAllPending();
}

// ─── REQUEST PERMISSION ───────────────────────────────────────
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Notifications not supported in this browser');
    return false;
  }

  const result = await Notification.requestPermission();
  notifPermission = result;

  if (result === 'granted') {
    showToast('Notifications enabled ✓');
    // Show a test notification
    new Notification('Limitless', {
      body: 'You\'ll be notified when your AI limits reset.',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'limitless-welcome',
    });
    return true;
  } else {
    showToast('Notifications blocked. You can enable them in browser settings.');
    return false;
  }
}

// ─── SCHEDULE A NOTIFICATION ─────────────────────────────────
function scheduleNotification(account, resetAt) {
  if (!('Notification' in window) || notifPermission !== 'granted') return;

  const delay = resetAt - new Date();
  if (delay <= 0) return; // Already past

  // Store in localStorage so we can reschedule on page reload
  const pending = getPendingNotifications();
  pending[account.id] = {
    accountId: account.id,
    platform: account.platform,
    email: account.email,
    resetAt: resetAt.toISOString(),
  };
  savePendingNotifications(pending);

  // Set the timeout
  setNotificationTimeout(account.id, account.platform, account.email, delay);
}

function setNotificationTimeout(accountId, platform, email, delay) {
  // Cap at ~24.8 days (max JS setTimeout)
  const safeDelay = Math.min(delay, 2147483647);

  setTimeout(() => {
    fireNotification(platform, email);

    // Remove from pending
    const pending = getPendingNotifications();
    delete pending[accountId];
    savePendingNotifications(pending);
  }, safeDelay);
}

// ─── SEND EMAIL ──────────────────────────────────────────────
function sendEmailNotification(platform, accountEmail) {
  if (localStorage.getItem('limitless_email_alerts') === 'off') return;
  if (!_userEmail) { console.warn('Email not sent: no user email'); return; }
  if (typeof emailjs === 'undefined') { console.warn('Email not sent: EmailJS not loaded'); return; }

  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email: _userEmail,
    platform: platform,
    account_email: accountEmail || '—',
    time: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  }).catch(console.error);
}

// ─── FIRE A NOTIFICATION ─────────────────────────────────────
function fireNotification(platform, accountEmail) {
  if (notifPermission === 'granted') {
    const n = new Notification(`${platform} is ready! ◎`, {
      body: `${accountEmail || 'Your account'} limit has reset. You can use it again now.`,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: `limitless-reset-${platform}-${accountEmail}`,
      renotify: true,
      vibrate: [200, 100, 200],
    });
    n.onclick = () => { window.focus(); n.close(); };
  }

  if (typeof addNotifHistory === 'function') {
    addNotifHistory(platform, accountEmail);
  }
}

// ─── NOTIFY RESET (called from app.js countdowntick) ─────────
function notifyReset(account) {
  fireNotification(account.platform, account.email);
}

// ─── RESCHEDULE ON LOAD ───────────────────────────────────────
function rescheduleAllPending() {
  if (notifPermission !== 'granted') return;

  const pending = getPendingNotifications();
  const now = new Date();

  Object.values(pending).forEach(entry => {
    const resetAt = new Date(entry.resetAt);
    const delay = resetAt - now;

    if (delay <= 0) {
      // Already reset — fire immediately (tab was closed during reset)
      fireNotification(entry.platform, entry.email);
      delete pending[entry.accountId];
    } else {
      setNotificationTimeout(entry.accountId, entry.platform, entry.email, delay);
    }
  });

  savePendingNotifications(pending);
}

// ─── STORAGE HELPERS ─────────────────────────────────────────
function getPendingNotifications() {
  try {
    return JSON.parse(localStorage.getItem('limitless_pending_notifs') || '{}');
  } catch {
    return {};
  }
}

function savePendingNotifications(pending) {
  localStorage.setItem('limitless_pending_notifs', JSON.stringify(pending));
}
