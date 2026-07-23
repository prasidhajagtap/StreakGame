// ============================================================================
//  config.js  — EDIT THIS FILE with your own Supabase project values.
// ----------------------------------------------------------------------------
//  The ANON key is safe to expose publicly. All real security is enforced by
//  Row-Level Security (RLS) policies in the database (see /sql/schema.sql).
//  NEVER put the `service_role` key anywhere in this repo.
// ============================================================================

export const CONFIG = {
  // From: Supabase Dashboard → Project Settings → API
  SUPABASE_URL: 'https://YOUR-PROJECT-ref.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',

  // Internal domain used to map a username to an email for Supabase Auth.
  // Users never see this. Do not change after launch (existing logins depend on it).
  AUTH_EMAIL_DOMAIN: 'hrjump.local',

  // Username rules (kept in sync with the DB CHECK constraint in schema.sql).
  USERNAME_MIN: 3,
  USERNAME_MAX: 20,
  USERNAME_REGEX: /^[a-zA-Z0-9_]{3,20}$/,

  // Password rules.
  PASSWORD_MIN: 6,
  PASSWORD_MAX: 72, // bcrypt limit used by Supabase Auth

  // Client-side brute-force cool-down (real rate limiting is enforced by Supabase).
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_LOCKOUT_MS: 60_000,
};
