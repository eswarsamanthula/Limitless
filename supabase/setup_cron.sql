-- Run in Supabase SQL Editor (Dashboard > SQL Editor)
-- Requires pg_cron and pg_net extensions

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule Edge Function every 2 minutes
SELECT cron.schedule(
  'limitless-send-reset-emails',
  '*/2 * * * *',
  $$SELECT net.http_post(
    url:='https://cuhjdrbzyazhyuhdcrri.supabase.co/functions/v1/send-reset-emails',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer limitless-cron-6f8a2b1e'
    ),
    body:='{}'::jsonb
  )::text$$
);

-- Verify the job was created
SELECT * FROM cron.job WHERE jobname = 'limitless-send-reset-emails';
