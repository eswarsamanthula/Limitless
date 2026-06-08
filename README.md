# Limitless — AI Limit Tracker

**[https://applimitlessai.vercel.app](https://applimitlessai.vercel.app)**

Track AI usage limits across all your accounts and platforms. Never miss a reset.

## Features

- **Multi-platform tracking** — Claude, ChatGPT, Gemini, Grok, Copilot + custom platforms
- **Account types** — Free / Pro / Custom (e.g. Max, Plus, Ultra)
- **Limit logging** — Log when you hit a limit, set a countdown timer
- **Live cross-device sync** — Changes appear on all devices within ~1s via Supabase Realtime
- **Email alerts** — Client-side EmailJS + optional server-side Edge Function via pg_cron
- **Projects & Groups** — Organize accounts by project or team
- **Dashboard** — Filter by cooldown status, group, or search; sort by platform/status
- **Weekly Report** — See limit hits per day, platforms used, cooling accounts
- **Limit Heatmap** — Year-long visual of when you hit limits
- **Rotation Planner** — Suggests the next account to use (sorted by earliest reset)
- **Cost Tracker** — Editable per-platform pricing, auto-calculates monthly spend
- **Messages Library** — Save full AI conversations with export to `.txt`
- **Prompt Library** — Save reusable prompts with copy & export
- **Saved Chats** — Bookmark AI conversation URLs with notes
- **Streak Tracking** — 🔥 Consecutive-day logging streak with milestone celebrations
- **Export** — Download `.txt` files for accounts, prompts, chats, and messages
- **Dark/Light theme** — Toggle in settings

## Setup

### 1. Clone & configure
```
git clone https://github.com/eswarsamanthula/Limitless.git
cd Limitless
```
Copy `js/config.example.js` → `js/config.js` and fill in:
- Supabase URL & anon key
- EmailJS service ID, template ID, public key
- Google OAuth client ID

### 2. Serve locally
```
npx serve .
# or open with Live Server / any static server
```

### 3. Supabase project
- Create a project at [supabase.com](https://supabase.com)
- Run `supabase/schema.sql` in SQL Editor (creates tables, RLS, Realtime publications)
- Optionally run `supabase/setup_cron.sql` to activate the Edge Function cron job
- Enable Google OAuth in Authentication > Providers
- Add your site URL to Auth settings

### 4. Deploy Edge Function (optional)
```
cd supabase/functions/send-reset-emails
# Deploy via Supabase Dashboard or CLI
# Set environment secrets: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
# EMAILJS_USER_ID, EMAILJS_ACCESS_TOKEN
```

## Tech

- Vanilla JS PWA (single-page app, no framework)
- **Supabase** — Auth (Google OAuth), Database (accounts, projects, user_data), Realtime sync
- **EmailJS** — Client-side email notifications (200 free/month)
- **Supabase Edge Function** — Server-side email via pg_cron (optional, every 2 min)
- **Google OAuth** — Sign-in with Google account

## Project Structure
```
├── index.html              # All UI (sidebar, modals, views)
├── css/style.css           # All styles
├── js/
│   ├── app.js              # Main app: state, rendering, all views
│   ├── db.js               # Supabase client, CRUD, auth
│   ├── config.js           # Public keys (committed)
│   ├── config.example.js   # Template for config
│   └── notifications.js    # EmailJS integration
└── supabase/               # Local-only (gitignored)
    ├── schema.sql          # Full DB schema + RLS + Realtime
    ├── setup_cron.sql      # pg_cron job config
    └── functions/
        └── send-reset-emails/
            ├── index.ts    # Edge Function source
            └── deno.json   # Import map
```
