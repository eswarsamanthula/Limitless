// ============================================================
//  LIMITLESS — CONFIG (example — fill in your own values)
//  Copy this as config.js and replace the placeholders.
// ============================================================

const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your_anon_key';

const EMAILJS_PUBLIC_KEY  = 'your_public_key';
const EMAILJS_SERVICE_ID  = 'service_xxx';
const EMAILJS_TEMPLATE_ID = 'template_xxx';

const PLATFORM_COLORS = {
  Claude:  '#d4744a',
  ChatGPT: '#10a37f',
  Gemini:  '#4285f4',
  Grok:    '#6b6b6b',
  Copilot: '#0f6cbd',
  Other:   '#9ca3af',
};

const PLATFORM_RESET_HOURS = {
  Claude:  3,
  ChatGPT: 3,
  Gemini:  6,
  Grok:    24,
  Copilot: 24,
  Other:   6,
};
window.PLATFORM_COLORS = PLATFORM_COLORS;
