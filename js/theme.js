'use strict';

const THEMES = ['auto', 'light', 'dark'];
const THEME_ICONS  = { auto: '◑', light: '○', dark: '●' };
const THEME_LABELS = { auto: 'Auto', light: 'Light', dark: 'Dark' };

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }
  const icon  = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (icon)  icon.textContent  = THEME_ICONS[theme]  || '◑';
  if (label) label.textContent = THEME_LABELS[theme] || 'Auto';
  localStorage.setItem('limitless_theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('limitless_theme') || 'auto';
  applyTheme(saved);
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = localStorage.getItem('limitless_theme') || 'auto';
    const idx = THEMES.indexOf(current);
    const next = THEMES[(idx + 1) % THEMES.length];
    applyTheme(next);
    showToast(`Theme: ${THEME_LABELS[next]}`);
  });
}

(function initThemeNoFlash() {
  const saved = localStorage.getItem('limitless_theme') || 'auto';
  if (saved === 'dark')  document.documentElement.setAttribute('data-theme', 'dark');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
})();
