-- ============================================================================
--  HR JUMP — Database schema, security policies & server-side game logic.
-- ----------------------------------------------------------------------------
--  Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
--
--  Security model (static site + public anon key):
--   * ALL access control lives here in Row-Level Security (RLS) + RPCs.
--   * SQL injection is impossible via the Supabase client (PostgREST params),
--     and these functions never build SQL from strings.
--   * Score submission, streak logic and the "one play per day" rule run
--     inside SECURITY DEFINER functions the client cannot bypass.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES  (one row per user, keyed to Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text not null unique
                   check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  high_score     integer not null default 0 check (high_score >= 0),
  best_level     integer not null default 1 check (best_level >= 1),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_played    date,                         -- the day the daily attempt was used
  last_score     integer not null default 0,   -- score of that most recent day
  last_level     integer not null default 1,   -- level reached that day
  game_in_progress boolean not null default false, -- a begun-but-unfinished climb
  total_games    integer not null default 0 check (total_games >= 0),
  is_admin       boolean not null default false,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists profiles_high_score_idx
  on public.profiles (high_score desc);

-- ---------------------------------------------------------------------------
-- 2. SCORES  (per-game history, used by the admin dashboard)
-- ---------------------------------------------------------------------------
create table if not exists public.scores (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  score         integer not null check (score >= 0),
  level_reached integer not null check (level_reached >= 1),
  streak        integer not null default 0,
  played_at     timestamptz not null default now()
);

create index if not exists scores_user_idx on public.scores (user_id);

-- ---------------------------------------------------------------------------
-- 3. HELPER — is the current caller an admin?  (SECURITY DEFINER avoids
--    recursive RLS evaluation on the profiles table.)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. AUTO-CREATE a profile whenever a new auth user signs up.
--    Username is taken from the signup metadata (options.data.username).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'username', 'user_' || left(new.id::text, 8)))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. ENABLE RLS + POLICIES
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.scores   enable row level security;

-- profiles: a user may read only their own row; admins may read all.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.uid() = id or public.is_admin());

-- profiles: NO direct insert/update/delete for clients.
--   * insert happens via the signup trigger (SECURITY DEFINER)
--   * all mutations happen via the RPCs below (SECURITY DEFINER)
-- (Leaving no INSERT/UPDATE/DELETE policy = those actions are denied.)

-- scores: a user may read only their own history; admins read all.
drop policy if exists scores_select on public.scores;
create policy scores_select on public.scores
  for select using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- 6a. BEGIN A GAME  — consumes today's single attempt UP FRONT (strict).
--     Because the daily lock is set here (not at finish), refreshing or
--     re-opening mid-game cannot buy a second attempt. Also fixes the streak
--     for the day so the correct start power-ups can be granted (rule 12).
-- ---------------------------------------------------------------------------
create or replace function public.begin_game()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me           public.profiles;
  v_today      date := current_date;
  v_new_streak integer;
  v_bonus      integer := 0;
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'no_profile'; end if;
  if not me.is_active then raise exception 'account_disabled'; end if;

  -- STRICT one play per day: the attempt is spent the moment it begins.
  if me.last_played = v_today then
    raise exception 'already_played_today';
  end if;

  -- Streak: consecutive days keep it alive; a gap resets it.
  if me.last_played = v_today - 1 then
    v_new_streak := me.current_streak + 1;
  else
    v_new_streak := 1;
  end if;

  if v_new_streak >= 6 then v_bonus := 10;
  elsif v_new_streak >= 2 then v_bonus := 5;
  end if;

  update public.profiles set
    last_played      = v_today,          -- <- attempt consumed here
    current_streak   = v_new_streak,
    longest_streak   = greatest(longest_streak, v_new_streak),
    total_games      = total_games + 1,
    game_in_progress = true,
    last_score       = 0,                -- today's result until finish updates it
    last_level       = 1
  where id = me.id;

  return json_build_object(
    'streak',          v_new_streak,
    'streak_bonus',    v_bonus,
    'start_shield',    (v_new_streak >= 1),  -- Fast-Track grace on any streak
    'start_extra_life',(v_new_streak >= 6)   -- +1 life on a long streak
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6b. FINISH A GAME  — records the score for a climb that was begun today.
--     Rejects a finish with no active game (prevents double-submit / spoofed
--     submissions without a begin).
-- ---------------------------------------------------------------------------
create or replace function public.finish_game(p_score integer, p_level integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me      public.profiles;
  v_bonus integer := 0;
  v_final integer;
begin
  -- Defence-in-depth sanity limits (not full anti-cheat).
  if p_score is null or p_score < 0 or p_score > 1000000 then
    raise exception 'invalid_score';
  end if;
  if p_level is null or p_level < 1 or p_level > 100 then
    raise exception 'invalid_level';
  end if;

  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'no_profile'; end if;
  if not me.game_in_progress then raise exception 'no_active_game'; end if;

  -- Streak bonus uses the streak fixed at begin_game (rule 12: 5–10 pts).
  if me.current_streak >= 6 then v_bonus := 10;
  elsif me.current_streak >= 2 then v_bonus := 5;
  end if;
  v_final := p_score + v_bonus;

  update public.profiles set
    high_score       = greatest(high_score, v_final),
    best_level       = greatest(best_level, p_level),
    last_score       = v_final,
    last_level       = p_level,
    game_in_progress = false
  where id = me.id;

  insert into public.scores (user_id, score, level_reached, streak)
  values (me.id, v_final, p_level, me.current_streak);

  return json_build_object(
    'raw_score',    p_score,
    'streak_bonus', v_bonus,
    'final_score',  v_final,
    'streak',       me.current_streak,
    'high_score',   greatest(me.high_score, v_final)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. LEADERBOARD  — top 5 active players (public-safe columns only).
-- ---------------------------------------------------------------------------
create or replace function public.get_leaderboard()
returns table (
  rank integer, username text, high_score integer, current_streak integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    (row_number() over (order by high_score desc, longest_streak desc))::int,
    username, high_score, current_streak
  from public.profiles
  where is_active and high_score > 0
  order by high_score desc, longest_streak desc
  limit 5;
$$;

-- ---------------------------------------------------------------------------
-- 8. MY RANK  — the caller's own rank / score / streak / daily-status.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_rank()
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare me public.profiles; v_rank integer;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then return null; end if;

  select count(*) + 1 into v_rank
  from public.profiles
  where is_active and high_score > me.high_score;

  return json_build_object(
    'username',        me.username,
    'rank',            case when me.high_score > 0 then v_rank else null end,
    'high_score',      me.high_score,
    'best_level',      me.best_level,
    'current_streak',  me.current_streak,
    'longest_streak',  me.longest_streak,
    'played_today',    (me.last_played = current_date),
    'last_score',      me.last_score,
    'last_level',      me.last_level,
    'is_active',       me.is_active
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. ADMIN RPCs  — each re-checks is_admin() so a normal user cannot call them.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns setof public.profiles
language sql
security definer
set search_path = public
stable
as $$
  select * from public.profiles
  where public.is_admin()          -- returns nothing for non-admins
  order by high_score desc;
$$;

create or replace function public.admin_set_active(p_user uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  update public.profiles set is_active = p_active where id = p_user;
end;
$$;

create or replace function public.admin_reset_streak(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  update public.profiles set current_streak = 0 where id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. GRANTS — expose only these functions to logged-in users.
-- ---------------------------------------------------------------------------
grant execute on function public.is_admin()                           to authenticated;
grant execute on function public.begin_game()                         to authenticated;
grant execute on function public.finish_game(integer, integer)       to authenticated;
grant execute on function public.get_leaderboard()                    to authenticated, anon;
grant execute on function public.get_my_rank()                        to authenticated;
grant execute on function public.admin_list_users()                   to authenticated;
grant execute on function public.admin_set_active(uuid, boolean)      to authenticated;
grant execute on function public.admin_reset_streak(uuid)             to authenticated;

-- ============================================================================
--  AFTER RUNNING THIS: register your own account through the game UI, then
--  promote it to admin ONCE with (replace the username):
--
--     update public.profiles set is_admin = true where username = 'yourname';
-- ============================================================================
