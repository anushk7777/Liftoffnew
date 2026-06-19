// Supabase Edge Function: send-reminders
// Sends a web-push notification for each task whose scheduledAt just passed.
// Crash-proof: every failure is returned as readable JSON instead of killing
// the function, and `?test=1` force-sends a test push to your devices now.
//
// Deploy: see docs/PUSH_SETUP.md. Requires secrets VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT and "Verify JWT" OFF (so the cron can call it).
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  try {
    const pub = Deno.env.get("VAPID_PUBLIC_KEY");
    const priv = Deno.env.get("VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:anushkdua2508@gmail.com";
    if (!pub || !priv) return json(500, { ok: false, step: "secrets", error: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set" });

    let webpush: any;
    try {
      webpush = (await import("npm:web-push@3.6.7")).default;
    } catch (e) {
      return json(500, { ok: false, step: "import web-push", error: String(e) });
    }
    webpush.setVapidDetails(subject, pub, priv);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const testMode = new URL(req.url).searchParams.get("test") === "1";
    const now = Date.now();
    const windowStart = now - 90_000;

    const { data: rows, error } = await supabase.from("user_data").select("id, data");
    if (error) return json(500, { ok: false, step: "select user_data", error: error.message });

    let sent = 0, due = 0, subscriptions = 0;
    for (const row of rows ?? []) {
      const tasks: any[] = row.data?.tasks ?? [];
      const dueTasks = testMode
        ? tasks.slice(0, 1)
        : tasks.filter((t) => t.status !== "done" && t.scheduledAt &&
            Date.parse(t.scheduledAt) > windowStart && Date.parse(t.scheduledAt) <= now);
      due += dueTasks.length;
      if (!dueTasks.length) continue;

      const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, subscription").eq("user_id", row.id);
      subscriptions += subs?.length ?? 0;
      for (const task of dueTasks) {
        const payload = JSON.stringify({ title: "Liftoff reminder", body: task.title ?? "Reminder", url: "/tasks" });
        for (const s of subs ?? []) {
          try { await webpush.sendNotification(s.subscription, payload); sent++; }
          catch (e: any) {
            if (e?.statusCode === 404 || e?.statusCode === 410)
              await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
            else console.error("send error", e?.statusCode, String(e));
          }
        }
      }
    }
    return json(200, { ok: true, sent, due, subscriptions, testMode });
  } catch (e) {
    return json(500, { ok: false, step: "unhandled", error: String(e) });
  }
});
