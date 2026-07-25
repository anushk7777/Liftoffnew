// Supabase Edge Function: delete-account
//
// Deletes the CALLER'S OWN account and everything attached to it. Removing an
// auth user needs the service-role key, which must never reach the browser, so
// this has to live server-side.
//
// The only identity this function will ever act on is the one inside the bearer
// token it was called with. There is no user id parameter, by design — nothing
// a caller sends can point this at somebody else's account.
//
// Deploy:
//   supabase functions deploy delete-account
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (both are set for you by
// the platform). Leave "Verify JWT" ON — the caller must be signed in.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      return json(500, { ok: false, step: "secrets", error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set" });
    }

    // Identify the caller from their own token. Anything else is refused.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { ok: false, step: "auth", error: "Not signed in" });

    const admin = createClient(url, serviceKey);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json(401, { ok: false, step: "auth", error: userErr?.message ?? "Invalid session" });
    }
    const uid = userData.user.id;

    const deleted: Record<string, string> = {};

    // Diary photos are files: they are not covered by any row cascade, so they
    // have to go first, while we still know the folder name.
    try {
      const { data: files } = await admin.storage.from("journal-photos").list(uid, { limit: 1000 });
      const paths = (files ?? []).map((f) => `${uid}/${f.name}`);
      if (paths.length) await admin.storage.from("journal-photos").remove(paths);
      deleted["journal-photos"] = `${paths.length} file(s)`;
    } catch (e) {
      deleted["journal-photos"] = `skipped: ${String(e)}`;
    }

    // user_data has no foreign key to auth.users, so deleting the user would
    // strand this row. Remove it explicitly. (The cascade migration fixes the
    // schema; this keeps the function correct either way.)
    for (const table of ["user_data", "journal_data", "workout_data", "push_subscriptions"]) {
      const column = table === "push_subscriptions" ? "user_id" : "id";
      const { error } = await admin.from(table).delete().eq(column, uid);
      deleted[table] = error ? `error: ${error.message}` : "removed";
    }

    // Finally the account itself. journal_data / workout_data cascade from here
    // too; the explicit deletes above just make the order irrelevant.
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) return json(500, { ok: false, step: "deleteUser", error: delErr.message, deleted });

    return json(200, { ok: true, deleted });
  } catch (e) {
    return json(500, { ok: false, step: "unhandled", error: String(e) });
  }
});
