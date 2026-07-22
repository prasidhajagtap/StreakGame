-- ============================================================
-- Daily Streak Challenge — Database Schema (Supabase / Postgres)
-- ============================================================
-- Run this in Supabase SQL Editor.
-- Design notes:
--   * "Account locked till next day" = a row in daily_plays for today.
--     If a row exists for (user, today), account is locked.
--   * Passwords are bcrypt-hashed inside Edge Functions, never here.
--   * All writes go through Edge Functions (service role), so tables
--     are locked down with RLS and NO public policies.
-- ============================================================

-- ---------- USERS ----------
create table if not exists public.users (
  id           uuid primary key default gen_random_uuid(),
  username     text unique not null check (char_length(username) between 3 and 20),
  password_hash text not null,
  is_admin     boolean not null default false,
  is_super_admin boolean not null default false,
  is_blocked   boolean not null default false,
  total_points bigint not null default 0,
  current_streak int not null default 0,
  best_streak  int not null default 0,
  last_play_date date,           -- last calendar day the user completed the task
  failed_attempts int not null default 0,  -- consecutive wrong logins
  lockout_until timestamptz,               -- login blocked until this time
  created_at   timestamptz not null default now()
);

create index if not exists idx_users_points on public.users (total_points desc);

-- ---------- DAILY PLAYS (one row per user per day = the lock) ----------
create table if not exists public.daily_plays (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  play_date   date not null,
  base_points int not null default 0,      -- puzzle base + speed + accuracy
  checkin_points int not null default 0,   -- flat daily check-in bonus (+5)
  bonus_points int not null default 0,     -- streak bonus (streak_day * 10)
  difficulty  text,                         -- 'easy', 'medium', or 'hard'
  total_points int not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, play_date)               -- HARD LOCK: 1 play per user per day
);

create index if not exists idx_plays_date on public.daily_plays (play_date);

-- ---------- SESSIONS (opaque token -> user) ----------
create table if not exists public.sessions (
  token       text primary key,
  user_id     uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists idx_sessions_user on public.sessions (user_id);

-- ---------- HR FACTS (admin-manageable, hire-to-retire lifecycle) ----------
-- Short 1-2 line facts shown at the end of each day (info only, not scored).
create table if not exists public.hr_facts (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  stage       text,                          -- e.g. Hire, Onboard, Develop, Retire
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- RATE LIMITS (brute-force / abuse throttling) ----------
create table if not exists public.rate_limits (
  key          text primary key,          -- e.g. 'login:1.2.3.4' or 'signup:1.2.3.4'
  count        int not null default 0,
  window_start timestamptz not null default now()
);

-- ============================================================
-- Row Level Security: lock everything. Edge Functions use the
-- service_role key which bypasses RLS. No public policies added.
-- ============================================================
alter table public.users       enable row level security;
alter table public.daily_plays enable row level security;
alter table public.sessions    enable row level security;
alter table public.hr_facts    enable row level security;
alter table public.rate_limits enable row level security;

-- ---------- Seed HR lifecycle facts (hire -> retire) ----------
insert into public.hr_facts (text, stage) values
('An offer letter is what formally starts hiring — it sets the role, pay, and joining date before day one.','Hire'),
('Structured onboarding helps a new joiner settle in and reach full productivity much faster.','Onboard'),
('A probation period is a trial window for both sides to check the role is a good fit before it is confirmed.','Onboard'),
('A performance appraisal reviews how someone is doing, guiding growth, pay, and goals.','Develop'),
('Learning and development keeps skills current and is one of the strongest drivers of staff retention.','Develop'),
('Succession planning prepares people to step into key roles later, so the business is not caught short.','Retain'),
('Recognition and fair pay are two of the biggest reasons employees choose to stay.','Retain'),
('An exit interview captures honest feedback when someone leaves, helping improve future retention.','Retire'),
('Full and final settlement is the last pay step at exit: dues, leave encashment, and deductions are cleared.','Retire'),
('Separation — resignation or retirement — is the final stage of the hire-to-retire journey.','Retire')
on conflict do nothing;
