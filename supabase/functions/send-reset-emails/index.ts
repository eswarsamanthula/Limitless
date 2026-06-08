import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

serve(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = Deno.env.get("CRON_SECRET") || "limitless-cron-6f8a2b1e";
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

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

  let sent = 0;

  for (const account of accounts) {
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
        service_id: Deno.env.get("EMAILJS_SERVICE_ID")!,
        template_id: Deno.env.get("EMAILJS_TEMPLATE_ID")!,
        user_id: Deno.env.get("EMAILJS_USER_ID")!,
        accessToken: Deno.env.get("EMAILJS_ACCESS_TOKEN")!,
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

    if (res.ok) sent++;
    else console.error("EmailJS error:", await res.text());

    await supabase.from("accounts")
      .update({ limit_hit_at: null, reset_at: null, limit_note: null })
      .eq("id", account.id);
  }

  return new Response(JSON.stringify({ sent, total: accounts.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
