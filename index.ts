// ============================================================
// Daily Streak Challenge — Edge Function (single router)
// Deploy: supabase functions deploy game --no-verify-jwt
// ============================================================
// Handles: signup, login, me, play, leaderboard, hr_fact,
//          and admin actions (list users, block, reset, points,
//          HR fact CRUD). Super admin is seeded on first boot.
// ============================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Super admin seed (you). Set these as function secrets in production.
const SUPER_ADMIN_EMAIL = Deno.env.get("SUPER_ADMIN_EMAIL") ?? "prasidhajagtap@yahoo.com";
const SUPER_ADMIN_PASS  = Deno.env.get("SUPER_ADMIN_PASS")  ?? "SoniyaJ@#2104";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const CHECKIN_BONUS = 5;      // flat points for showing up (daily check-in)
const STREAK_STEP = 10;       // streak bonus = streak_day * STREAK_STEP
const STREAK_RESET_GAP = 7;   // miss this many days in a row -> streak back to day 1

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}
function todayStr() {
  // Use IST so "a day" matches the user's calendar day.
  const now = new Date(Date.now() + 5.5 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}
function newToken() {
  return crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
}
// whole days between two YYYY-MM-DD strings (b - a)
function dayGap(a: string, b: string) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
}
// Best-effort client IP from proxy headers (Supabase sits behind a proxy).
function clientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for") || "";
  return xf.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}
// Simple fixed-window rate limiter backed by a table. Returns true if allowed.
// Not perfectly atomic (fine for a game); for hard guarantees use a SQL function.
async function rateLimit(key: string, max: number, windowSec: number) {
  const now = Date.now();
  const { data } = await db.from("rate_limits").select("*").eq("key", key).maybeSingle();
  if (!data) {
    await db.from("rate_limits").insert({ key, count: 1, window_start: new Date(now).toISOString() });
    return true;
  }
  if (now - Date.parse(data.window_start) > windowSec * 1000) {
    await db.from("rate_limits").update({ count: 1, window_start: new Date(now).toISOString() }).eq("key", key);
    return true;
  }
  if (data.count >= max) return false;
  await db.from("rate_limits").update({ count: data.count + 1 }).eq("key", key);
  return true;
}

async function ensureSuperAdmin() {
  const { data } = await db.from("users").select("id").eq("username", SUPER_ADMIN_EMAIL).maybeSingle();
  if (!data) {
    const hash = await bcrypt.hash(SUPER_ADMIN_PASS);
    await db.from("users").insert({
      username: SUPER_ADMIN_EMAIL,
      password_hash: hash,
      is_admin: true,
      is_super_admin: true,
    });
  }
}

async function userFromToken(token?: string) {
  if (!token) return null;
  const { data: s } = await db.from("sessions").select("user_id, expires_at").eq("token", token).maybeSingle();
  if (!s || new Date(s.expires_at) < new Date()) return null;
  const { data: u } = await db.from("users").select("*").eq("id", s.user_id).maybeSingle();
  return u ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  await ensureSuperAdmin();

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = body.action as string;
  const token  = req.headers.get("authorization")?.replace("Bearer ", "") || body.token;

  try {
    // ---------------- AUTH ----------------
    if (action === "signup") {
      const ip = clientIp(req);
      if (!(await rateLimit("signup:" + ip, 5, 3600)))
        return json({ error: "Too many sign-ups from here. Try again later." }, 429);
      const username = String(body.username ?? "").trim();
      const password = String(body.password ?? "");
      // Username: 3–20 chars, letters/numbers and . _ - only (no spaces, HTML, emoji).
      if (!/^[A-Za-z0-9._-]{3,20}$/.test(username))
        return json({ error: "Username must be 3–20 characters: letters, numbers, . _ - only." }, 400);
      // Password: 6–72 chars (bcrypt ignores bytes past 72).
      if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
      if (password.length > 72) return json({ error: "Password must be at most 72 characters." }, 400);
      const { data: exists } = await db.from("users").select("id").eq("username", username).maybeSingle();
      if (exists) return json({ error: "That username is taken. Pick another." }, 409);
      const hash = await bcrypt.hash(password);
      const { data: u, error } = await db.from("users").insert({ username, password_hash: hash }).select().single();
      if (error) return json({ error: "Could not create account." }, 400);
      const t = newToken();
      await db.from("sessions").insert({ token: t, user_id: u.id, expires_at: new Date(Date.now() + 30*864e5).toISOString() });
      return json({ token: t, user: publicUser(u) });
    }

    if (action === "login") {
      const ip = clientIp(req);
      if (!(await rateLimit("login:" + ip, 20, 300)))
        return json({ error: "Too many attempts. Please slow down." }, 429);
      const username = String(body.username ?? "").trim().slice(0, 40);
      const password = String(body.password ?? "").slice(0, 72);
      const { data: u } = await db.from("users").select("*").eq("username", username).maybeSingle();
      if (!u) return json({ error: "Wrong username or password." }, 401);
      if (u.is_blocked) return json({ error: "This account is blocked. Contact the admin." }, 403);
      // Account lockout after repeated failures.
      if (u.lockout_until && new Date(u.lockout_until) > new Date())
        return json({ error: "Too many failed attempts. Try again in a few minutes." }, 429);
      const ok = await bcrypt.compare(password, u.password_hash);
      if (!ok) {
        const fa = (u.failed_attempts || 0) + 1;
        const upd: any = { failed_attempts: fa };
        if (fa >= 5) { upd.failed_attempts = 0; upd.lockout_until = new Date(Date.now() + 15*60000).toISOString(); }
        await db.from("users").update(upd).eq("id", u.id);
        return json({ error: "Wrong username or password." }, 401);
      }
      await db.from("users").update({ failed_attempts: 0, lockout_until: null }).eq("id", u.id);
      const t = newToken();
      await db.from("sessions").insert({ token: t, user_id: u.id, expires_at: new Date(Date.now() + 30*864e5).toISOString() });
      return json({ token: t, user: publicUser(u) });
    }

    if (action === "logout") {
      if (token) await db.from("sessions").delete().eq("token", token);
      return json({ ok: true });
    }

    // ---------------- SESSION-REQUIRED ----------------
    const me = await userFromToken(token);
    if (!me) return json({ error: "Please log in again." }, 401);

    if (action === "me") {
      const locked = await isLockedToday(me.id);
      return json({ user: publicUser(me), lockedToday: !!locked, todayPlay: locked });
    }

    if (action === "status") {
      const locked = await isLockedToday(me.id);
      return json({ lockedToday: !!locked, todayPlay: locked });
    }

    if (action === "hr_fact") {
      // return one random active HR fact (quick info shown at end of each day)
      const { data: fs } = await db.from("hr_facts").select("*").eq("is_active", true);
      if (!fs || fs.length === 0) return json({ fact: null });
      const f = fs[Math.floor(Math.random() * fs.length)];
      return json({ fact: { id: f.id, text: f.text, stage: f.stage } });
    }

    if (action === "play") {
      // The core: lock the account for today by inserting a daily_plays row.
      const already = await isLockedToday(me.id);
      if (already) return json({ error: "You already played today. Come back tomorrow!", lockedToday: true, todayPlay: already }, 409);

      // Jigsaw score (puzzle base + speed + accuracy) is computed on the client
      // and clamped here. NOTE: client-reported. See README "Security notes".
      const base = Math.max(0, Math.min(3000, Number(body.base ?? 0)));
      const difficulty = ["easy", "medium", "hard"].includes(body.difficulty) ? body.difficulty : "easy";
      const checkin = CHECKIN_BONUS;

      // Forgiving streak: keep counting up unless the gap since the last play is
      // STREAK_RESET_GAP days or more, in which case restart at day 1.
      const today = todayStr();
      let streak: number;
      if (!me.last_play_date) {
        streak = 1;
      } else {
        const gap = dayGap(me.last_play_date, today);
        streak = gap >= STREAK_RESET_GAP ? 1 : (me.current_streak || 0) + 1;
      }
      const streakBonus = streak * STREAK_STEP;

      const total = base + checkin + streakBonus;
      const best = Math.max(me.best_streak || 0, streak);

      const { error: perr } = await db.from("daily_plays").insert({
        user_id: me.id, play_date: today, difficulty,
        base_points: base, checkin_points: checkin, bonus_points: streakBonus,
        total_points: total,
      });
      if (perr) return json({ error: "You already played today.", lockedToday: true }, 409);

      await db.from("users").update({
        total_points: (me.total_points || 0) + total,
        current_streak: streak, best_streak: best, last_play_date: today,
      }).eq("id", me.id);

      return json({
        result: { base, checkin, streakBonus, total, streak, difficulty },
      });
    }

    if (action === "leaderboard") {
      // Top 5 for display. Caller's world rank computed with a count query so we
      // don't have to pull every row just to find their position.
      const { data: top } = await db.from("users")
        .select("username, total_points, current_streak")
        .eq("is_super_admin", false)
        .order("total_points", { ascending: false }).limit(5);
      const { count: total } = await db.from("users")
        .select("*", { count: "exact", head: true }).eq("is_super_admin", false);
      const { count: ahead } = await db.from("users")
        .select("*", { count: "exact", head: true })
        .eq("is_super_admin", false).gt("total_points", me.total_points || 0);
      const myRank = me.is_super_admin ? null : (ahead ?? 0) + 1;
      const inTop5 = myRank !== null && myRank <= 5;
      return json({
        top5: top ?? [], myRank, inTop5,
        myScore: me.total_points, myStreak: me.current_streak,
        total: total ?? 0,
      });
    }

    // ---------------- ADMIN ----------------
    if (action?.startsWith("admin_")) {
      if (!me.is_admin) return json({ error: "Admins only." }, 403);

      if (action === "admin_users") {
        const { data } = await db.from("users")
          .select("id, username, total_points, current_streak, best_streak, is_admin, is_super_admin, is_blocked, last_play_date, created_at")
          .order("total_points", { ascending: false });
        return json({ users: data ?? [] });
      }

      // Only super admin can do destructive / privileged things
      const needSuper = ["admin_block","admin_delete","admin_setpoints","admin_make_admin","admin_reset_day","admin_add_fact","admin_del_fact"];
      if (needSuper.includes(action) && !me.is_super_admin)
        return json({ error: "Super admin only." }, 403);

      if (action === "admin_block") {
        await db.from("users").update({ is_blocked: !!body.blocked }).eq("id", body.user_id);
        return json({ ok: true });
      }
      if (action === "admin_delete") {
        await db.from("users").delete().eq("id", body.user_id).eq("is_super_admin", false);
        return json({ ok: true });
      }
      if (action === "admin_setpoints") {
        await db.from("users").update({ total_points: Number(body.points) }).eq("id", body.user_id);
        return json({ ok: true });
      }
      if (action === "admin_make_admin") {
        await db.from("users").update({ is_admin: !!body.make }).eq("id", body.user_id).eq("is_super_admin", false);
        return json({ ok: true });
      }
      if (action === "admin_reset_day") {
        // let a user play again today (unlock)
        await db.from("daily_plays").delete().eq("user_id", body.user_id).eq("play_date", todayStr());
        return json({ ok: true });
      }
      if (action === "admin_fact_list") {
        const { data } = await db.from("hr_facts").select("*").order("created_at");
        return json({ facts: data ?? [] });
      }
      if (action === "admin_add_fact") {
        const f = body.f || {};
        const text = String(f.text ?? "").trim().slice(0, 300);
        const stage = f.stage != null ? String(f.stage).trim().slice(0, 40) : null;
        if (text.length < 3) return json({ error: "Fact text is too short." }, 400);
        await db.from("hr_facts").insert({ text, stage, is_active: true });
        return json({ ok: true });
      }
      if (action === "admin_del_fact") {
        await db.from("hr_facts").delete().eq("id", body.id);
        return json({ ok: true });
      }
      if (action === "admin_stats") {
        const { count: userCount } = await db.from("users").select("*", { count: "exact", head: true });
        const { count: playsToday } = await db.from("daily_plays").select("*", { count: "exact", head: true }).eq("play_date", todayStr());
        return json({ userCount: userCount ?? 0, playsToday: playsToday ?? 0 });
      }
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

async function isLockedToday(userId: string) {
  const { data } = await db.from("daily_plays").select("*").eq("user_id", userId).eq("play_date", todayStr()).maybeSingle();
  return data ?? null;
}
function publicUser(u: any) {
  return {
    id: u.id, username: u.username, total_points: u.total_points,
    current_streak: u.current_streak, best_streak: u.best_streak,
    last_play_date: u.last_play_date,
    is_admin: u.is_admin, is_super_admin: u.is_super_admin,
  };
}
