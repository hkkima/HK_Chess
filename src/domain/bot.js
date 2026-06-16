// 봇 레이팅 계산 (DESIGN 5.4)
//  - 1일차: 1000 고정
//  - 2일차+: 직전 라운드 시점 참가자 effectiveRating 평균

import { BOT_DAY1_RATING } from './rules.js';
import { effectiveRating } from './ratings.js';

/**
 * @param {number} day 현재 라운드의 일차 (1~8)
 * @param {import('./types.js').Player[]} players
 * @returns {number}
 */
export function botRatingForRound(day, players) {
  if (day <= 1) return BOT_DAY1_RATING;
  const active = players.filter((p) => p.status !== 'disqualified');
  if (active.length === 0) return BOT_DAY1_RATING;
  const sum = active.reduce((s, p) => s + effectiveRating(p), 0);
  return Math.round(sum / active.length);
}
