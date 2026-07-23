// ============================================================================
//  main.js — the game page controller (screens, forms, HUD, game lifecycle).
// ============================================================================

import { register, login, logout, getSession, onAuthChange } from './auth.js';
import { beginGame, finishGame, fetchMyRank } from './api.js';
import { renderLeaderboard } from './leaderboard.js';
import { Engine } from './game/engine.js';
import { POWERUPS } from './game/powerups.js';

const $ = (id) => document.getElementById(id);
const screens = ['auth', 'home', 'game', 'over'];
function showScreen(name) {
  screens.forEach((s) => { $(`screen-${s}`).hidden = s !== name; });
}

let engine = null;
let myRank = null;      // cached get_my_rank result
let authMode = 'login'; // 'login' | 'register'

// ---------------------------------------------------------------------------
// AUTH SCREEN
// ---------------------------------------------------------------------------
function setAuthMode(mode) {
  authMode = mode;
  $('auth-title').textContent = mode === 'login' ? 'Welcome back' : 'Create your account';
  $('auth-submit').textContent = mode === 'login' ? 'Log in' : 'Register';
  $('auth-switch').innerHTML = mode === 'login'
    ? `New here? <button type="button" id="to-register" class="link">Create an account</button>`
    : `Already have an account? <button type="button" id="to-login" class="link">Log in</button>`;
  $('to-register')?.addEventListener('click', () => setAuthMode('register'));
  $('to-login')?.addEventListener('click', () => setAuthMode('login'));
  $('auth-error').textContent = '';
}

function initAuthForm() {
  setAuthMode('login');

  $('toggle-pw').addEventListener('click', () => {
    const inp = $('auth-password');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    $('toggle-pw').textContent = show ? '🙈 Hide' : '👁 Show';
  });

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('auth-submit');
    const err = $('auth-error');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Please wait…';

    const username = $('auth-username').value;
    const password = $('auth-password').value;
    const fn = authMode === 'login' ? login : register;
    const res = await fn(username, password);

    btn.disabled = false;
    setAuthMode(authMode); // reset button label
    if (!res.ok) { err.textContent = res.message; return; }

    if (authMode === 'register') {
      // Supabase may require email confirmation OFF for username auth to log
      // straight in. If a session exists we proceed; otherwise prompt login.
      const session = await getSession();
      if (!session) {
        setAuthMode('login');
        err.textContent = 'Account created! Please log in.';
        return;
      }
    }
    await enterHome();
  });
}

// ---------------------------------------------------------------------------
// HOME SCREEN
// ---------------------------------------------------------------------------
async function enterHome() {
  showScreen('home');
  try {
    myRank = await fetchMyRank();
  } catch (e) { console.error(e); myRank = null; }

  $('home-username').textContent = myRank?.username || 'Player';
  $('home-streak').textContent = myRank?.current_streak ?? 0;
  $('home-best').textContent = (myRank?.high_score ?? 0).toLocaleString();

  const playedToday = !!myRank?.played_today;
  const inactive = myRank?.is_active === false;
  const playBtn = $('btn-play');
  playBtn.disabled = playedToday || inactive;

  // Today's result — shown only once the daily climb has been played (rule).
  const result = $('today-result');
  if (playedToday && myRank) {
    result.hidden = false;
    result.innerHTML = `
      <div class="today-label">Today's climb</div>
      <div class="today-score">${(myRank.last_score ?? 0).toLocaleString()} <span>pts</span></div>
      <div class="today-sub">Reached level ${myRank.last_level ?? 1} · 🔥 ${myRank.current_streak}-day streak</div>`;
  } else {
    result.hidden = true;
  }

  if (inactive) {
    playBtn.textContent = '🚫 Account deactivated';
    $('play-note').textContent = 'Your account has been deactivated. Contact the admin.';
  } else if (playedToday) {
    playBtn.textContent = '✅ Played today — back tomorrow';
    $('play-note').textContent = 'One climb a day keeps your streak alive. See you tomorrow! 🔥';
  } else if ((myRank?.current_streak ?? 0) >= 1) {
    playBtn.textContent = "▶ Start today's climb";
    $('play-note').textContent = `🔥 ${myRank.current_streak}-day streak — you start with a Fast-Track boost + bonus points!`;
  } else {
    playBtn.textContent = "▶ Start today's climb";
    $('play-note').textContent = 'You get ONE climb per day. Make it count!';
  }

  await renderLeaderboard({ listEl: $('lb-list'), meEl: $('lb-me') });
}

function initHome() {
  $('btn-play').addEventListener('click', startGame);
  $('btn-logout').addEventListener('click', async () => { await logout(); });
  $('btn-refresh-lb').addEventListener('click', () =>
    renderLeaderboard({ listEl: $('lb-list'), meEl: $('lb-me') }));
  $('btn-share').addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ title: 'HR Jump Leaderboard', url });
      else { await navigator.clipboard.writeText(url); flash($('btn-share'), 'Link copied!'); }
    } catch { /* user cancelled share */ }
  });
}

function flash(el, msg) {
  const old = el.textContent;
  el.textContent = msg;
  setTimeout(() => { el.textContent = old; }, 1500);
}

// ---------------------------------------------------------------------------
// GAME SCREEN
// ---------------------------------------------------------------------------
async function startGame() {
  const playBtn = $('btn-play');
  if (playBtn.disabled) return;

  // Strict one-per-day: confirm, then CONSUME the attempt server-side before
  // any gameplay. If the network fails the server state is untouched, so the
  // attempt is preserved and the player can retry.
  if (!confirm('This is your ONE climb for today. Ready to start?')) return;

  const prevLabel = playBtn.textContent;
  playBtn.disabled = true;
  playBtn.textContent = 'Starting…';

  let begin;
  try {
    begin = await beginGame();          // <- daily attempt spent here
  } catch (err) {
    alert(err.message);
    await enterHome();                  // re-sync (e.g. already played on another device)
    return;
  } finally {
    playBtn.textContent = prevLabel;
  }

  showScreen('game');

  const streak = begin.streak ?? 0;
  const startLives = begin.start_extra_life ? 4 : 3;
  const startShieldMs = begin.start_shield ? 3000 : 0;

  const banner = $('game-banner');
  if (streak >= 1) {
    banner.textContent = `🔥 ${streak}-day streak bonus active!`;
    banner.hidden = false;
    setTimeout(() => { banner.hidden = true; }, 2500);
  } else {
    banner.hidden = true;
  }

  if (!engine) engine = new Engine($('game-canvas'), {
    onState: updateHud,
    onLevelUp: (info) => showToast(`Promoted to ${info.name}! ${info.emoji}`),
    onPickup: (type) => {
      if (type === 'coin') return;
      showToast(`${POWERUPS[type].emoji} ${POWERUPS[type].label}!`);
    },
    onHit: (label) => showToast(`Ouch! ${label} 💥`, true),
    onLift: (lives) => showToast(`Finger lifted! −1 life (${lives} left) ✋`, true),
    onWaiting: ({ lives, first }) => showWait(lives, first),
    onResume: hideWait,
    onGameOver: handleGameOver,
  });

  engine.start({ lives: startLives, streak, startShieldMs });
}

function updateHud(s) {
  $('hud-level').textContent = `${s.levelInfo.emoji} ${s.levelInfo.name}`;
  $('hud-score').textContent = s.score.toLocaleString();
  $('hud-lives').textContent = '❤️'.repeat(s.lives) || '💀';
  const pu = [];
  if (s.slowMs > 0)   pu.push(`☕ ${Math.ceil(s.slowMs / 1000)}s`);
  if (s.shieldMs > 0) pu.push(`⚡ ${Math.ceil(s.shieldMs / 1000)}s`);
  $('hud-powerups').textContent = pu.join('   ');
}

function showWait(lives, first) {
  const w = $('game-wait');
  $('game-wait-title').textContent = first ? 'Hold to climb' : 'You lifted off!';
  $('game-wait-msg').textContent = first
    ? 'Press and hold anywhere. Keep your finger down — lifting off costs a life. Dodge the HR hazards!'
    : `Careful — that cost a life. ${'❤️'.repeat(lives)} left. Touch and hold to jump back in.`;
  w.hidden = false;
}
function hideWait() { $('game-wait').hidden = true; }

let toastTimer = 0;
function showToast(msg, danger = false) {
  const t = $('game-toast');
  t.textContent = msg;
  t.className = 'game-toast' + (danger ? ' danger' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1400);
}

// ---------------------------------------------------------------------------
// GAME OVER
// ---------------------------------------------------------------------------
async function handleGameOver({ score, level }) {
  showScreen('over');
  $('over-title').textContent = 'Shift over!';
  $('over-breakdown').innerHTML = '<p class="muted">Saving your climb…</p>';

  try {
    const r = await finishGame(score, level);
    myRank = await fetchMyRank(); // refresh cached streak/played_today/last_score
    $('over-breakdown').innerHTML = `
      <div class="score-big">${r.final_score.toLocaleString()}</div>
      <ul class="over-list">
        <li><span>Climb score</span><span>${r.raw_score.toLocaleString()}</span></li>
        <li><span>Streak bonus</span><span>+${r.streak_bonus}</span></li>
        <li><span>Current streak</span><span>🔥 ${r.streak} day(s)</span></li>
        <li><span>Your best</span><span>${r.high_score.toLocaleString()}</span></li>
      </ul>
      <p class="muted">Come back tomorrow to keep your streak alive!</p>`;
  } catch (err) {
    $('over-breakdown').innerHTML =
      `<div class="score-big">${score.toLocaleString()}</div>
       <p class="muted">${err.message}</p>`;
    myRank = await fetchMyRank().catch(() => myRank);
  }

  await renderLeaderboard({ listEl: $('over-lb-list'), meEl: null });
}

function initOver() {
  $('btn-home').addEventListener('click', enterHome);
  $('btn-over-share').addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ title: 'HR Jump Leaderboard', url });
      else { await navigator.clipboard.writeText(url); flash($('btn-over-share'), 'Link copied!'); }
    } catch { /* cancelled */ }
  });
}

// ---------------------------------------------------------------------------
// BOOTSTRAP
// ---------------------------------------------------------------------------
async function boot() {
  initAuthForm();
  initHome();
  initOver();

  onAuthChange((session) => {
    if (!session) { showScreen('auth'); setAuthMode('login'); }
  });

  const session = await getSession();
  if (session) await enterHome();
  else showScreen('auth');
}

boot();
