// ============================================================================
//  levels.js — HR "hire-to-retire" career stages and the difficulty curve.
// ----------------------------------------------------------------------------
//  Slow and gentle through level 5, noticeably faster after 5, and a harder
//  spawn rate after 11 (rule 3).
// ============================================================================

export const LEVELS = [
  { name: 'Intern',              emoji: '🎓' },
  { name: 'Trainee',            emoji: '📗' },
  { name: 'Junior Associate',   emoji: '🧑‍💼' },
  { name: 'Associate',          emoji: '💼' },
  { name: 'Senior Associate',   emoji: '📈' },
  { name: 'Team Lead',          emoji: '🧭' },   // level 6: pace picks up
  { name: 'Manager',            emoji: '🗂️' },
  { name: 'Senior Manager',     emoji: '📊' },
  { name: 'Director',           emoji: '🎯' },
  { name: 'Senior Director',    emoji: '🏆' },
  { name: 'Vice President',     emoji: '👔' },   // level 11: things get hard
  { name: 'SVP',                emoji: '🥇' },
  { name: 'Chief People Officer', emoji: '⭐' },
  { name: 'CEO',                emoji: '👑' },
  { name: 'Board Member',       emoji: '🏛️' },
  { name: 'Retirement 🎉',       emoji: '🌴' },
];

// Score needed to REACH each level (index 0 = level 1).
export const THRESHOLDS = [
  0, 150, 350, 600, 900, 1300, 1800, 2400, 3100, 3900,
  4800, 5900, 7200, 8700, 10400, 12500,
];

/** 1-based level number for a given score. */
export function levelForScore(score) {
  let lvl = 1;
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (score >= THRESHOLDS[i]) lvl = i + 1;
  }
  return Math.min(lvl, LEVELS.length);
}

/**
 * Difficulty parameters for a level number:
 *   speedMul — world scroll multiplier (career climb speed)
 *   spawnMs  — ms between obstacle spawns (lower = more obstacles)
 *   double   — after level 11, sometimes spawn two obstacles at once
 */
export function levelParams(level) {
  let speed = 1;
  for (let i = 2; i <= level; i++) {
    if (i <= 5)       speed += 0.07;   // gentle early ramp
    else if (i <= 11) speed += 0.13;   // faster after level 5
    else              speed += 0.20;   // steep after level 11
  }

  let spawnMs = 1500 - (level - 1) * 70;
  if (level > 11) spawnMs -= (level - 11) * 60; // extra pressure late game
  spawnMs = Math.max(480, spawnMs);

  return {
    speedMul: speed,
    spawnMs,
    double: level > 11,
    info: LEVELS[level - 1],
  };
}
