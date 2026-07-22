# Puzzle Streak

A once-a-day office jigsaw. Log in, solve **one puzzle** made from a royalty-free office photo, check in for bonus points, keep your **streak**, and see a quick **HR fact**. After you solve it, your account **locks until the next day**. Styled in a warm red-and-gold palette.

## What's inside
| File | What it is |
|---|---|
| `web/index.html` | The whole game — one file. Login, home, puzzle, result + daily HR fact, leaderboard, admin. Mobile-first. |
| `supabase/schema.sql` | Database tables (users, daily_plays, sessions, hr_facts). |
| `supabase/functions/game/index.ts` | All server logic (signup, login, play, leaderboard, hr_fact, admin) with bcrypt + session tokens. |

## Try it now (Demo mode)
Open `web/index.html` on your phone or browser. Data is saved only in that browser — this is just for feel.

- Super admin login (works in demo too): `prasidhajagtap@yahoo.com` / `SoniyaJ@#2104`
- Play → drag each piece to its spot → read the HR fact at the end. The reference photo is shown top-left.

## Puzzle images (CDN + offline fallback)
- Puzzle pictures are **royalty-free office photos from Unsplash** (free license), listed in the `IMAGES` array near the top of the `<script>`. Swap them for any image URLs you like.
- Pieces are sliced with **CSS `background-position`** (no `<canvas>`, so **no CORS is needed** — any image that loads will slice).
- If a photo can't load (e.g. the phone is offline), the game **falls back to a drawn office artifact** so it never breaks. To make it fully offline-first, bundle a few images inside the app and point `IMAGES` at local paths.

## Difficulty — automatic (no picker)
The grid is chosen from the player's current streak:
- **Days 1–7:** always **Easy** (3×3), with a faint reference ghost on the board.
- **Streak 8–26:** **Medium** (4×4) every alternate day, **Easy** otherwise.
- **Streak 27+:** **Hard** every 4th day — randomly **5×5 or 6×6** — and **Easy** on the other days.

> This is a clean, deterministic reading of your rules (first week easy; medium every other day once consistent; hard only after a long streak). The bands live in one function, `pickDifficulty()`, so we can retune any threshold in seconds — e.g. keep Medium going during the hard tier instead of dropping to Easy.

## Points logic
- **Puzzle base** = Easy 80 / Medium 150 / Hard 240
- **Speed bonus** = up to +50 (faster = more)
- **Accuracy bonus** = +30, minus 5 per wrong drop
- **Daily check-in** = flat **+5** for playing
- **Streak bonus** = streak_day × 10

## HR fact of the day
After every solve, the game shows one short **HR fact** (one or two lines) — information only, no question and no scoring. Facts span the whole employee lifecycle: offer, onboarding, probation, development, appraisal, retention, succession, offboarding, full-and-final, retirement. Manage them from the admin **HR Facts** tab. If the device is offline, a built-in fact list is used.

## Streak rules (forgiving)
- Each day you play, your streak grows by 1.
- Miss up to **6 days** in a row and the streak survives.
- Miss **7 days in a row** → streak resets to **day 1**.
- The home screen shows your **last 7 days** of check-ins (stored on the device, as requested).

## The "one play a day" lock
`daily_plays` has one row per user per day. Once today's row exists, the account is locked till the next IST calendar day. Super admin can "Unlock today" for any user.

## Leaderboard
- **Top 5** worldwide, each with score and 🔥 **current streak**.
- If you're not in the top 5, your row is pinned at the bottom with your **world ranking** (e.g. `#42`), streak, and score, plus how many players you're ranked against.

## Go live with Supabase
1. New Supabase project → copy Project URL + `anon` key.
2. SQL Editor → run `supabase/schema.sql` (also seeds HR facts).
3. `supabase functions deploy game --no-verify-jwt`
4. `supabase secrets set SUPER_ADMIN_EMAIL=prasidhajagtap@yahoo.com SUPER_ADMIN_PASS='SoniyaJ@#2104'`
5. Point the app at your backend (browser console, once):
   ```js
   localStorage.setItem("API_URL","https://YOUR-PROJECT.supabase.co/functions/v1/game");
   localStorage.setItem("ANON_KEY","YOUR_SUPABASE_ANON_KEY"); location.reload();
   ```

## Host on GitHub Pages
`web/index.html` is a **single self-contained file** (all HTML, CSS, and JS inside — no build step, no JS libraries), so it hosts on GitHub Pages as-is:
1. Put `index.html` in a repo (root, or a `/docs` folder).
2. Repo **Settings → Pages** → set the source branch/folder → save. Your game is live at `https://<user>.github.io/<repo>/`.

Caveat: on GitHub Pages the game runs in **demo mode** (scores + leaderboard live in each visitor's browser, not shared). For a **real cross-player leaderboard**, you still need the Supabase backend (the edge function can't run on Pages) — deploy that and point the app at it as shown above. Puzzle photos load from the CDN, which works fine over the internet.

## Ship to Google Play (Capacitor)
Drop `web/index.html` into a Capacitor `www/` folder, build the AAB via your GitHub Actions pipeline, upload to Play Console. If you want it to work offline, bundle the office images and point `IMAGES` at local files.

## Security — what's protected
- **SQL injection: safe.** All database access uses Supabase's query builder (parameterized). There is no raw SQL and no string concatenation into queries.
- **Brute force: mitigated.** Login is rate-limited per IP (20 tries / 5 min) and each account locks for 15 minutes after 5 wrong passwords. Sign-ups are limited to 5 per IP per hour. (Backed by a `rate_limits` table + `failed_attempts`/`lockout_until` on the user row.)
- **Input validation:** username must be 3–20 chars of letters/numbers/`. _ -` (no spaces, HTML, or emoji); password 6–72 chars (bcrypt ignores bytes past 72); `base` score is clamped 0–3000; difficulty is whitelisted; HR fact text is capped at 300 chars. The same checks run on the client (instant feedback) and the server (the real gate).
- **XSS:** all user-supplied text (usernames, facts) is HTML-escaped before it's shown.
- **Passwords** are bcrypt-hashed; sessions are opaque 30-day tokens; all tables have RLS on with no public policies (only the service-role Edge Function can read/write).

### Still worth adding for a public launch
- The IP rate limiter is a simple fixed window and isn't perfectly atomic under a burst — fine for a game; use a Postgres function or a WAF (Cloudflare) if you expect real attack traffic.
- No email verification or password reset yet (there's no email on file — usernames only).
- The **puzzle score is client-reported** (clamped server-side). Add server-side checks if real prizes ride on it.
- Demo mode (no backend) keeps data in the browser only, so none of the above applies there — it's local and single-device by design.

## Mobile
Built mobile-first: one column capped at 520px, `100dvh` height, bottom tab bar, and buttons use `touch-action: manipulation` (no double-tap zoom lag). During a drag the page scroll is **locked** so a piece can't drift, and the piece tray scrolls inside its own bounded area (`max-height: 34vh`) so big Hard grids don't stretch the page. Some vertical scroll on a 6×6 Hard puzzle is expected; the drag itself stays scroll-safe.

