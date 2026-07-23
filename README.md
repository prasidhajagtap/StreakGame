# 🎓 HR Jump — the Game (repo 1 of 2)

A warm-themed mobile web game. Hold your finger on the screen and fly your
employee mascot up the career ladder — Intern → CEO → Retirement — dodging HR
hazards, grabbing power-ups, and building a daily streak.

This repo is the **player app**. The **admin dashboard** lives in a separate
repo (`hr-jump-admin`). Both talk to the **same Supabase project**.

> ⚠️ Set up this repo **first** — it contains the database schema
> ([`sql/schema.sql`](sql/schema.sql)) that both apps share.

---

## 🎮 How to play
- **Press and hold** anywhere — the mascot flies to just above your fingertip.
- **Lifting your finger costs a life.** So does hitting an obstacle.
- **3 lives** and **strictly one climb per day** (the attempt is spent the moment
  you tap Start, after a confirm — refreshing or switching devices can't buy a
  second go).
- After playing, the home screen shows **today's score** plus buttons to view /
  refresh the leaderboard. Your next climb unlocks tomorrow.
- Play daily to keep your **streak** 🔥 for bonus points.
- Power-ups: ☕ Coffee Break (slow) · ⚡ Fast-Track (blast through) ·
  ❤️ Wellness Day (+life) · 🪙 Coins (+25). Faster after L5, harder after L11.

---

## 🗂️ Files
```
index.html            The game (login → home → play → game over)
css/styles.css        Warm theme (orange / gold / crimson)
js/config.js          ⚙️ YOU EDIT — Supabase URL + anon key
js/supabaseClient.js  Shared Supabase client
js/auth.js            Register / login / logout
js/api.js             Game data layer (leaderboard, rank, begin/finish game)
js/leaderboard.js     Top-5 board + your own rank
js/main.js            Page controller
js/game/              engine · player · obstacles · powerups · levels
sql/schema.sql        🛢️ Run once in Supabase (tables, security, game logic)
```

---

## 1️⃣ Set up Supabase (shared by both repos)

1. Go to <https://supabase.com> → **New project**. Wait for it to finish.
2. **SQL Editor → New query** → paste all of [`sql/schema.sql`](sql/schema.sql)
   → **Run**. This creates the tables, security policies, and game logic.
3. **Authentication → Providers → Email**:
   - ✅ Email provider **enabled**
   - ❌ **Confirm email** — turn **OFF** (usernames map to non-deliverable
     `name@hrjump.local` addresses, so confirmation emails can't work)
4. **Authentication → Sign In / Providers** (settings): ✅ **Allow new users to
   sign up** — ON.
5. **Project Settings → API** — copy your **Project URL** and **anon / public**
   key. You'll paste them in Step 3 below (and again in the admin repo — **same
   values**).

> The **anon** key is meant to be public — all real security is in the database
> (Row-Level Security). **Never** commit the `service_role` key anywhere.

---

## 2️⃣ Create the repo & upload — all in the GitHub website

No terminal needed.

1. On <https://github.com>, click **➕ (top-right) → New repository**.
2. Name it `hr-jump-game`, choose **Public** (free GitHub Pages needs Public),
   leave "Add a README" **unchecked**, click **Create repository**.
3. On the empty repo page, click the **“uploading an existing file”** link
   (or **Add file → Upload files**).
4. Open this `game` folder on your computer. **Select its _contents_** —
   `index.html` and the `css`, `js`, `sql` folders — and **drag them onto the
   upload area**. (Chrome/Edge/Firefox keep the folder structure.)
   > Upload the **contents**, not the `game` folder itself, so `index.html`
   > lands at the repo root.
5. At the bottom, type a commit message (e.g. “initial”) and click
   **Commit changes**.

---

## 3️⃣ Add your Supabase keys (in the web editor)

1. In the repo, open **`js/config.js`** → click the **✏️ pencil (Edit this
   file)**.
2. Replace the two placeholders with your values from Step 1.5:
   ```js
   SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGci...your anon key...',
   ```
3. Click **Commit changes**.

---

## 4️⃣ Turn on GitHub Pages

1. Repo **Settings** → **Pages** (left sidebar).
2. **Build and deployment → Source: Deploy from a branch.**
3. **Branch: `main`**, folder **`/ (root)`** → **Save**.
4. Wait ~1 minute, then refresh. Your game is live at the URL shown there:
   `https://<your-username>.github.io/hr-jump-game/`

---

## 5️⃣ Make yourself the admin
1. Open your live game and **Register** an account (e.g. `admin`).
2. In Supabase → **SQL Editor**, run (with your username):
   ```sql
   update public.profiles set is_admin = true where username = 'admin';
   ```
3. Now set up the **`hr-jump-admin`** repo (see its README) and log in there
   with this same account.

---

## 🔧 Tuning
- Career stages / difficulty → [`js/game/levels.js`](js/game/levels.js)
- Speed, scoring, spawn rates → top of [`js/game/engine.js`](js/game/engine.js)
- Power-up strength / rarity → [`js/game/powerups.js`](js/game/powerups.js)
- Streak bonus points → `begin_game()` / `finish_game()` in [`sql/schema.sql`](sql/schema.sql)
- Theme colours → `:root` in [`css/styles.css`](css/styles.css)

## 🔐 Security in short
Parameterised RPCs (no SQL injection), Row-Level Security + `SECURITY DEFINER`
functions for all writes, Supabase-hosted password hashing, server-enforced
one-play-per-day and streaks, and a client login cool-down. See the schema
comments for details.
