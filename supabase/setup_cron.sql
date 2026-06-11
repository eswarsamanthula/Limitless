-- Run in Supabase SQL Editor (Dashboard > SQL Editor)
-- Requires pg_cron and pg_net extensions

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- IMPORTANT: Set CRON_SECRET as a Supabase secret env var (never hardcode it here).
-- Run: supabase secrets set CRON_SECRET=<your-secret-value>
-- Then replace <YOUR_CRON_SECRET_HERE> below with the same value only for this
-- one-time SQL setup, or better yet use a Supabase Vault reference.

-- Schedule Edge Function every 1 minute
SELECT cron.schedule(
  'limitless-send-reset-emails',
  '* * * * *',
  $$SELECT net.http_post(
    url:='https://cuhjdrbzyazhyuhdcrri.supabase.co/functions/v1/send-reset-emails',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <YOUR_CRON_SECRET_HERE>'
    ),
    body:='{}'::jsonb
  )::text$$
);

-- Verify the job was created
SELECT * FROM cron.job WHERE jobname = 'limitless-send-reset-emails';