// ============================================================================
//  leaderboard.js — render the top 5 board + the current player's own rank.
// ----------------------------------------------------------------------------
//  Usernames are shown publicly (rule 5). No emails or IDs are ever exposed;
//  get_leaderboard() only returns username/score/streak.
// ============================================================================

import { fetchLeaderboard, fetchMyRank } from './api.js';

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/**
 * Render into #lb-list and #lb-me.
 * @param {object} opts { listEl, meEl }
 */
export async function renderLeaderboard({ listEl, meEl }) {
  listEl.innerHTML = '<li class="lb-loading">Loading…</li>';
  try {
    const [top, me] = await Promise.all([fetchLeaderboard(), fetchMyRank()]);

    if (!top.length) {
      listEl.innerHTML = '<li class="lb-empty">No scores yet — be the first to climb!</li>';
    } else {
      listEl.innerHTML = top
        .map((r, i) => {
          const mine = me && r.username === me.username ? ' lb-mine' : '';
          return `
            <li class="lb-row${mine}">
              <span class="lb-rank">${MEDALS[i] || r.rank}</span>
              <span class="lb-name">${esc(r.username)}</span>
              <span class="lb-streak" title="Current streak">🔥 ${r.current_streak}</span>
              <span class="lb-score">${r.high_score.toLocaleString()}</span>
            </li>`;
        })
        .join('');
    }

    if (meEl) {
      if (me && me.rank) {
        meEl.innerHTML = `
          <span class="lb-rank">#${me.rank}</span>
          <span class="lb-name">${esc(me.username)} <em>(you)</em></span>
          <span class="lb-streak">🔥 ${me.current_streak}</span>
          <span class="lb-score">${me.high_score.toLocaleString()}</span>`;
        meEl.hidden = false;
      } else if (me) {
        meEl.innerHTML =
          `<span class="lb-name">${esc(me.username)} — play a game to get ranked!</span>`;
        meEl.hidden = false;
      } else {
        meEl.hidden = true;
      }
    }
  } catch (err) {
    listEl.innerHTML = `<li class="lb-empty">Couldn't load leaderboard.</li>`;
    console.error('[leaderboard]', err);
  }
}
