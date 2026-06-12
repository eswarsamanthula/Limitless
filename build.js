const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || '';
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || '';
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || '';

const config = `const SUPABASE_URL = '${SUPABASE_URL}';
const SUPABASE_ANON_KEY = '${SUPABASE_ANON_KEY}';

const EMAILJS_PUBLIC_KEY  = '${EMAILJS_PUBLIC_KEY}';
const EMAILJS_SERVICE_ID  = '${EMAILJS_SERVICE_ID}';
const EMAILJS_TEMPLATE_ID = '${EMAILJS_TEMPLATE_ID}';

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
`;

const dir = path.join(__dirname, 'js');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'config.js'), config);
console.log('✓ Generated js/config.js');
