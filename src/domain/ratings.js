// effectiveRating — 초심자라 레이팅이 없는 경우가 많음(DESIGN 결정 #3).
// 있으면 진짜 레이팅, 없으면 실력 등급(A/B/C) 근사치로 채워 항상 숫자를 보장.

import { SKILL_APPROX } from './rules.js';

/** @param {import('./types.js').Skill} skill */
export function skillApprox(skill) {
  return SKILL_APPROX[skill] ?? 800;
}

/** @param {import('./types.js').Player} player */
export function effectiveRating(player) {
  if (player.rating != null && Number.isFinite(player.rating)) return player.rating;
  return skillApprox(player.skill);
}
