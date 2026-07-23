// ============================================================================
//  api.js — data layer for the GAME app, over the secure Supabase RPCs.
// ----------------------------------------------------------------------------
//  The client never writes to tables directly; everything routes through the
//  SECURITY DEFINER functions defined in sql/schema.sql.
// ============================================================================

import { supabase } from './supabaseClient.js';

/** Top 5 active players: [{ rank, username, high_score, current_streak }] */
export async function fetchLeaderboard() {
  const { data, error } = await supabase.rpc('get_leaderboard');
  if (error) throw new Error(error.message);
  return data || [];
}

/** The signed-in player's rank / score / streak / daily status / today's score. */
export async function fetchMyRank() {
  const { data, error } = await supabase.rpc('get_my_rank');
  if (error) throw new Error(error.message);
  return data; // may be null if profile not ready yet
}

/**
 * Begin today's single climb. Consumes the daily attempt UP FRONT (strict),
 * fixes the streak, and returns { streak, streak_bonus, start_shield,
 * start_extra_life }. Throws a friendly Error if the attempt is unavailable.
 */
export async function beginGame() {
  const { data, error } = await supabase.rpc('begin_game');
  if (error) {
    const map = {
      already_played_today: "You've already played today — come back tomorrow to keep your streak!",
      account_disabled:     'Your account has been deactivated. Contact the admin.',
    };
    const key = Object.keys(map).find((k) => error.message.includes(k));
    throw new Error(key ? map[key] : error.message);
  }
  return data;
}

/**
 * Finish the climb begun today. Returns { raw_score, streak_bonus,
 * final_score, streak, high_score }.
 */
export async function finishGame(score, level) {
  const { data, error } = await supabase.rpc('finish_game', {
    p_score: Math.max(0, Math.floor(score)),
    p_level: Math.max(1, Math.floor(level)),
  });
  if (error) {
    const map = {
      no_active_game: 'No active game to submit.',
      invalid_score:  'Score rejected by the server.',
      invalid_level:  'Level rejected by the server.',
    };
    const key = Object.keys(map).find((k) => error.message.includes(k));
    throw new Error(key ? map[key] : error.message);
  }
  return data;
}
