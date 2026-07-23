// ============================================================================
//  auth.js — registration, login, logout and session helpers.
// ----------------------------------------------------------------------------
//  Username/password is mapped onto Supabase Auth email/password internally,
//  so we get battle-tested password hashing + token sessions for free.
// ============================================================================

import { supabase } from './supabaseClient.js';
import { CONFIG } from './config.js';

// --- Input validation (client-side; the DB enforces the same rules) --------

export function validateUsername(username) {
  const u = (username || '').trim();
  if (!CONFIG.USERNAME_REGEX.test(u)) {
    return {
      ok: false,
      message: `Username must be ${CONFIG.USERNAME_MIN}-${CONFIG.USERNAME_MAX} ` +
               `characters: letters, numbers or underscore only.`,
    };
  }
  return { ok: true, value: u.toLowerCase() };
}

export function validatePassword(password) {
  const p = password || '';
  if (p.length < CONFIG.PASSWORD_MIN || p.length > CONFIG.PASSWORD_MAX) {
    return {
      ok: false,
      message: `Password must be ${CONFIG.PASSWORD_MIN}-${CONFIG.PASSWORD_MAX} characters.`,
    };
  }
  return { ok: true, value: p };
}

// Usernames are validated to [a-zA-Z0-9_], so this email is always well-formed.
function usernameToEmail(username) {
  return `${username.toLowerCase()}@${CONFIG.AUTH_EMAIL_DOMAIN}`;
}

// --- Simple client-side brute-force cool-down ------------------------------
//  (Supabase also rate-limits auth endpoints server-side.)
const LS_KEY = 'hrjump_login_guard';

function getGuard() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || { count: 0, until: 0 }; }
  catch { return { count: 0, until: 0 }; }
}
function setGuard(g) { localStorage.setItem(LS_KEY, JSON.stringify(g)); }

export function loginLockRemainingMs() {
  const g = getGuard();
  return Math.max(0, g.until - Date.now());
}
function recordFailure() {
  const g = getGuard();
  g.count += 1;
  if (g.count >= CONFIG.MAX_LOGIN_ATTEMPTS) {
    g.until = Date.now() + CONFIG.LOGIN_LOCKOUT_MS;
    g.count = 0;
  }
  setGuard(g);
}
function clearFailures() { setGuard({ count: 0, until: 0 }); }

// --- Public API ------------------------------------------------------------

export async function register(username, password) {
  const u = validateUsername(username);
  if (!u.ok) return { ok: false, message: u.message };
  const p = validatePassword(password);
  if (!p.ok) return { ok: false, message: p.message };

  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(u.value),
    password: p.value,
    options: { data: { username: u.value } }, // read by the DB signup trigger
  });

  if (error) {
    const msg = /already registered|exists/i.test(error.message)
      ? 'That username is already taken.'
      : error.message;
    return { ok: false, message: msg };
  }
  return { ok: true, data };
}

export async function login(username, password) {
  const wait = loginLockRemainingMs();
  if (wait > 0) {
    return {
      ok: false,
      message: `Too many attempts. Try again in ${Math.ceil(wait / 1000)}s.`,
    };
  }

  const u = validateUsername(username);
  if (!u.ok) return { ok: false, message: u.message };

  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(u.value),
    password: password || '',
  });

  if (error) {
    recordFailure();
    return { ok: false, message: 'Invalid username or password.' };
  }
  clearFailures();
  return { ok: true, data };
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}
