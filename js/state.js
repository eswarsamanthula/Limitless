'use strict';

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
  prompts: [],
  accountTags: {},
  costPrices: {},
  groups: [],
  chats: [],
  notifHistory: [],
  streak: { streak: 0, lastLog: '', history: [] },
  messages: [],
  limitHitTimeline: [],
  ritualSnapshot: null,
};
window.state = state;

function isPaidType(type) { return type && type !== 'free'; }
function typeTag(type) {
  if (type === 'pro') return `<span class="tag pro">PRO</span>`;
  if (type === 'free') return `<span class="tag free">FREE</span>`;
  return `<span class="tag custom">${escHtml(type.toUpperCase())}</span>`;
}

// currentUser is defined in db.js (loaded first)
