// ============================================================
//  LIMITLESS — CONFIG (your local copy, not committed)
//  Copy config.example.js → config.js and fill in your values
// ============================================================

// ─── SUPABASE ──────────────────────────────────────────────
const SUPABASE_URL = 'https://cuhjdrbzyazhyuhdcrri.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LZeC_lX1VliPk3T3KBW8LA_9_3Kdic8';

// ─── EMAILJS ───────────────────────────────────────────────
const EMAILJS_PUBLIC_KEY  = 'sLGWo-cMBlKG4v1Zq';
const EMAILJS_SERVICE_ID  = 'service_0syvobn';
const EMAILJS_TEMPLATE_ID = 'template_l8l206p';

// ─── PLATFORM COLORS ───────────────────────────────────────
const PLATFORM_COLORS = {
  Claude:  '#d4744a',
  ChatGPT: '#10a37f',
  Gemini:  '#4285f4',
  Grok:    '#6b6b6b',
  Copilot: '#0f6cbd',
  Other:   '#9ca3af',
};

// ─── DEFAULT RESET HOURS PER PLATFORM ──────────────────────
const PLATFORM_RESET_HOURS = {
  Claude:  3,
  ChatGPT: 3,
  Gemini:  6,
  Grok:    24,
  Copilot: 24,
  Other:   6,
};
window.PLATFORM_COLORS = PLATFORM_COLORS;
