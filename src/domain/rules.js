// 대회 규칙 상수 (DESIGN 5.1)
// 모든 도메인 로직이 참조하는 단일 진실의 원천.

export const POINTS = { win: 1, draw: 0.5, loss: 0 };

export const ABSENCE = {
  plannedBye: 0.5, // 사전 신고 결석
  unexcused: 0, // 무단 결석(부전패)
  dqThreshold: 3, // 누적 3회 이상 → 실격
};

export const BOT_DAY1_RATING = 1000;

export const SWISS_ROUNDS = 16; // 4일 × 4라운드
export const ROUNDS_PER_DAY = 4;
export const ADVANCE_COUNT = 16; // 녹아웃 진출 인원

// 레이팅이 없는 초심자를 위한 실력 등급 → 근사 레이팅 (DESIGN 4.3 effectiveRating)
export const SKILL_APPROX = { A: 1100, B: 900, C: 700 };

// 스위스 라운드별 타임 포맷
export const SWISS_TIME_FORMAT = '5분 무증초 블리츠';

/** 전체 라운드 순번(1~16)으로 일차 계산 */
export function dayOfRound(roundIndex) {
  return Math.ceil(roundIndex / ROUNDS_PER_DAY);
}
