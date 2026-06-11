import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

serve(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("CRON_SECRET env var is not set");
    return new Response("Unauthorized", { status: 401 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const emailjsServiceId = Deno.env.get("EMAILJS_SERVICE_ID");
  const emailjsTemplateId = Deno.env.get("EMAILJS_TEMPLATE_ID");
  const emailjsUserId = Deno.env.get("EMAILJS_USER_ID");
  const emailjsAccessToken = Deno.env.get("EMAILJS_ACCESS_TOKEN");

  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!emailjsServiceId) missing.push("EMAILJS_SERVICE_ID");
  if (!emailjsTemplateId) missing.push("EMAILJS_TEMPLATE_ID");
  if (!emailjsUserId) missing.push("EMAILJS_USER_ID");
  if (!emailjsAccessToken) missing.push("EMAILJS_ACCESS_TOKEN");
  if (missing.length) {
    console.error("Missing env vars:", missing.join(", "));
    return new Response(JSON.stringify({ error: `Missing env vars: ${missing.join(", ")}` }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id, user_id, platform, email, reset_at")
    .not("reset_at", "is", null)
    .lte("reset_at", new Date().toISOString());

  if (error) {
    console.error("Query error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  // Fetch email alert preferences for all affected users
  const userIds = [...new Set(accounts.map(a => a.user_id))];
  const { data: prefs } = await supabase
    .from("user_data")
    .select("user_id, value")
    .in("user_id", userIds)
    .eq("key", "email_alerts");
  const disabledUsers = new Set(
    (prefs || []).filter(r => r.value === false).map(r => r.user_id)
  );

  let sent = 0;

  for (const account of accounts) {
    // Skip users who have disabled email alerts
    if (disabledUsers.has(account.user_id)) continue;
    const { data: ownerEmail, error: rpcErr } = await supabase
      .rpc("get_user_email_by_id", { uid: account.user_id });

    if (rpcErr || !ownerEmail) {
      console.warn(`No owner email for user ${account.user_id}:`, rpcErr?.message);
      await supabase.from("accounts")
        .update({ limit_hit_at: null, reset_at: null, limit_note: null })
        .eq("id", account.id);
      continue;
    }

    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: emailjsServiceId,
        template_id: emailjsTemplateId,
        user_id: emailjsUserId,
        accessToken: emailjsAccessToken,
        template_params: {
          to_email: ownerEmail,
          platform: account.platform,
          account_email: account.email || "—",
          time: new Date().toLocaleString("en-US", {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
          }),
        },
      }),
    });

    if (res.ok) {
      sent++;
      await supabase.from("accounts")
        .update({ limit_hit_at: null, reset_at: null, limit_note: null })
        .eq("id", account.id);
    } else {
      console.error("EmailJS error for account", account.id, ":", await res.text());
      // Leave reset_at intact so the next cron run retries
    }
  }

  return new Response(JSON.stringify({ sent, total: accounts.length }), {
    headers: { "Content-Type": "application/json" },
  });
});