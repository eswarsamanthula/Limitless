# Limitless — AI Limit Tracker

Track AI usage limits across all your accounts and platforms. Never miss a reset.

## Features

- Track multiple AI platform accounts (Claude, ChatGPT, Gemini, Grok, Copilot)
- Log limits and set countdown timers
- Browser notifications when limits reset
- Email alerts via EmailJS
- Projects & groups to organize accounts
- Weekly reports, heatmap, and timeline
- Dark/light theme

## Setup

1. Clone the repo
2. Copy `js/config.example.js` → `js/config.js` and fill in your Supabase & EmailJS keys
3. Serve with any static server (e.g. Live Server, `npx serve .`)
4. Create a Supabase project and run the schema

## Tech

- Vanilla JS PWA
- Supabase (auth + database)
- EmailJS (email notifications)
