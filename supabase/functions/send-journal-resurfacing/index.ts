// Supabase Edge Function: send-journal-resurfacing
// The heart of Kairos's "amor fati" loop. Once a day it scans every user's
// journal for moments captured on this same calendar day in an EARLIER year —
// every anniversary (1 year ago, 2 years ago, …) — and resurfaces them:
//   • a web-push nudge (reuses the same VAPID infra as task reminders), and
//   • an email — "1 year ago today you wrote…" — if RESEND_API_KEY is set.
// It stays silent on any day that has no anniversary; it is NOT a daily reminder.
//
// Crash-proof: every failure returns readable JSON. `?test=1` resurfaces each
// user's most recent moment right now (bypassing the anniversary + de-dup check)
// so you can verify delivery end-to-end.
//
// Deploy: same procedure as send-reminders (see docs/KAIROS.md). Requires the
// VAPID_* secrets already used by send-reminders; email additionally needs
// RESEND_API_KEY and RESEND_FROM. Set "Verify JWT" OFF so the cron can call it.
import { createClient } from "npm:@supabase/supabase-js@2";

function ymd(iso: string) {
  const d = new Date(iso);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

// Same month+day across years, folding Feb-29 onto Feb-28 in non-leap years.
function sameCalendarDay(a: { m: number; d: number }, today: { m: number; d: number; y: number }) {
  if (a.m === today.m && a.d === today.d) return true;
  const leap = today.y % 4 === 0 && (today.y % 100 !== 0 || today.y % 400 === 0);
  return a.m === 2 && a.d === 29 && today.m === 2 && today.d === 28 && !leap;
}

function excerpt(text: string, max = 140) {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function yearsAgoLabel(n: number) {
  return n === 1 ? "1 year ago today" : `${n} years ago today`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  try {
    const pub = Deno.env.get("VAPID_PUBLIC_KEY");
    const priv = Deno.env.get("VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:anushkdua2508@gmail.com";
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM") ?? "Kairos <onboarding@resend.dev>";
    if (!pub || !priv) return json(500, { ok: false, step: "secrets", error: "VAPID keys not set" });

    let webpush: any;
    try {
      webpush = (await import("npm:web-push@3.6.7")).default;
    } catch (e) {
      return json(500, { ok: false, step: "import web-push", error: String(e) });
    }
    webpush.setVapidDetails(subject, pub, priv);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const testMode = new URL(req.url).searchParams.get("test") === "1";
    const now = new Date();
    const today = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
    const resurfaceOn = now.toISOString().slice(0, 10); // yyyy-mm-dd

    const { data: rows, error } = await supabase.from("journal_data").select("id, data");
    if (error) return json(500, { ok: false, step: "select journal_data", error: error.message });

    let pushes = 0, emails = 0, usersResurfaced = 0, momentsResurfaced = 0, skippedAlreadySent = 0;

    for (const row of rows ?? []) {
      const moments: any[] = row.data?.moments ?? [];
      if (!moments.length) continue;

      // Find this user's resurfacing candidates for today.
      let hits: { moment: any; yearsAgo: number }[] = [];
      if (testMode) {
        const newest = [...moments].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
        if (newest) hits = [{ moment: newest, yearsAgo: 1 }];
      } else {
        for (const mo of moments) {
          if (!mo?.createdAt) continue;
          const md = ymd(mo.createdAt);
          if (md.y >= today.y) continue;
          if (!sameCalendarDay(md, today)) continue;
          hits.push({ moment: mo, yearsAgo: today.y - md.y }); // every earlier year
        }
      }
      if (!hits.length) continue;

      // De-dup: claim each (user, moment, day). Skip ones already resurfaced today.
      const fresh: { moment: any; yearsAgo: number }[] = [];
      for (const h of hits) {
        const momentId = String(h.moment.id ?? h.moment.createdAt);
        if (!testMode) {
          const { error: claimErr } = await supabase
            .from("journal_resurface_log")
            .insert({ user_id: row.id, moment_id: momentId, resurface_on: resurfaceOn });
          if (claimErr) {
            if ((claimErr as any).code === "23505") { skippedAlreadySent++; continue; } // already sent
            console.error("resurface_log insert error", claimErr.message);
            continue;
          }
        }
        fresh.push(h);
      }
      if (!fresh.length) continue;

      fresh.sort((a, b) => a.yearsAgo - b.yearsAgo);
      usersResurfaced++;
      momentsResurfaced += fresh.length;
      const lead = fresh[0];

      // ---- Web push ----
      const { data: subs } = await supabase
        .from("push_subscriptions").select("endpoint, subscription").eq("user_id", row.id);
      if (subs?.length) {
        const body = fresh.length === 1
          ? `${yearsAgoLabel(lead.yearsAgo)}: “${excerpt(lead.moment.text || "a photo you kept", 90)}”`
          : `${fresh.length} moments come back today — starting ${yearsAgoLabel(lead.yearsAgo).toLowerCase()}.`;
        const payload = JSON.stringify({ title: "Kairos — on this day", body, url: "/" });
        for (const s of subs) {
          try { await webpush.sendNotification(s.subscription, payload); pushes++; }
          catch (e: any) {
            if (e?.statusCode === 404 || e?.statusCode === 410)
              await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
            else console.error("push error", e?.statusCode, String(e));
          }
        }
      }

      // ---- Email (optional; only when RESEND_API_KEY is configured) ----
      if (resendKey) {
        try {
          const { data: u } = await supabase.auth.admin.getUserById(row.id);
          const email = u?.user?.email;
          if (email) {
            const items = fresh.map((h) => {
              const d = new Date(h.moment.createdAt);
              const dateStr = d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
              const text = h.moment.text ? escapeHtml(h.moment.text) : "<em>(a photo you kept — open Kairos to see it)</em>";
              let songHtml = "";
              const songName = (h.moment.song ?? "").trim();
              if (songName) {
                const link = (h.moment.songUrl ?? "").trim() || `https://music.youtube.com/search?q=${encodeURIComponent(songName)}`;
                songHtml = `<div style="margin-top:12px"><a href="${escapeHtml(link)}" style="font:500 13px/1 -apple-system,Segoe UI,sans-serif;color:#6a5acd;text-decoration:none">♪ ${escapeHtml(songName)}</a></div>`;
              }
              return `<div style="margin:0 0 22px;padding:18px 20px;border:1px solid #e4e2de;border-radius:14px;background:#faf9f7">
                <div style="font:600 12px/1 -apple-system,Segoe UI,sans-serif;color:#6a5acd;letter-spacing:.02em;margin-bottom:8px">${yearsAgoLabel(h.yearsAgo).toUpperCase()}</div>
                <div style="font:400 18px/1.5 Georgia,serif;color:#16151a;white-space:pre-wrap">${text}</div>
                ${songHtml}
                <div style="font:400 12px/1 -apple-system,Segoe UI,sans-serif;color:#8a8880;margin-top:12px">${dateStr}</div>
              </div>`;
            }).join("");
            const html = `<div style="max-width:560px;margin:0 auto;padding:28px 20px;background:#ffffff">
              <div style="font:400 26px/1 Georgia,serif;color:#16151a;margin-bottom:6px">Kairos</div>
              <div style="font:400 14px/1.5 -apple-system,Segoe UI,sans-serif;color:#6b6a66;margin-bottom:24px">A moment comes back to you — love what was.</div>
              ${items}
              <div style="font:400 12px/1.5 -apple-system,Segoe UI,sans-serif;color:#a8a6a0;margin-top:8px">You're receiving this because you kept a moment on this day. It's private to you.</div>
            </div>`;
            const subjectLine = `${yearsAgoLabel(lead.yearsAgo)} — a moment from your Kairos`;
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from: resendFrom, to: email, subject: subjectLine, html }),
            });
            if (res.ok) emails++;
            else console.error("resend error", res.status, await res.text());
          }
        } catch (e) {
          console.error("email step error", String(e));
        }
      }
    }

    // Prune the ledger (older than ~40 days — anniversaries only recur yearly).
    if (!testMode) {
      const cutoff = new Date(now.getTime() - 40 * 24 * 60 * 60_000).toISOString().slice(0, 10);
      await supabase.from("journal_resurface_log").delete().lt("resurface_on", cutoff);
    }

    return json(200, { ok: true, usersResurfaced, momentsResurfaced, pushes, emails, skippedAlreadySent, emailConfigured: !!resendKey, testMode });
  } catch (e) {
    return json(500, { ok: false, step: "unhandled", error: String(e) });
  }
});
