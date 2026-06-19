// 녹아웃 결선 엔진 (DESIGN 5.5 / 2단계)
//
// - 시드: 스위스 최종 순위 상위 16 (1 vs 16, 2 vs 15 … 8 vs 9).
// - 미니매치 2판(1판 high=백, 2판 high=흑)으로 흑백 유불리 해소.
// - 합산 우세 → 승자. 1:1 동점 → 아마게돈 1판.
// - 스테이지: 16강 → 8강 → 4강 → 결승. 인원이 적으면 작은 스테이지부터 시작(테스트 유연).

import { ADVANCE_COUNT } from './rules.js';

export const KO_STAGES = ['16강', '8강', '4강', '결승'];

export const KO_CONFIG = {
  '16강': { day: 5, timeFormat: '10분 무증초 래피드', armageddon: '5분 블리츠' },
  '8강': { day: 6, timeFormat: '10분 무증초 래피드', armageddon: '5분 블리츠' },
  '4강': { day: 7, timeFormat: '10분 무증초 래피드', armageddon: '5분 블리츠' },
  '결승': { day: 8, timeFormat: '15+10 증초', armageddon: '10분 래피드' },
};

export function nextStage(stage) {
  const i = KO_STAGES.indexOf(stage);
  return i >= 0 && i < KO_STAGES.length - 1 ? KO_STAGES[i + 1] : null;
}

/** 인원수에 맞는 시작 스테이지 (16→16강, 8→8강, 4→4강, 2→결승) */
export function startingStageFor(n) {
  if (n <= 2) return '결승';
  if (n <= 4) return '4강';
  if (n <= 8) return '8강';
  return '16강';
}

/**
 * 진출자 선택 (순수). 운영자 오버라이드를 반영하되 항상 count(16) 이하 유지.
 *  - overrides: { [playerId]: 'in' | 'out' }
 *  - 확정탈락('out'): 순위와 무관히 제외 → 다음 순위가 슬롯 승계
 *  - 확정진출('in'): 순위와 무관히 포함 → 최하위 자동진출자를 밀어냄
 * @returns {import('./types.js').StandingRow[]}  시드 순서대로 정렬된 진출 행
 */
export function selectEntrants(standingRows, overrides = {}, count = ADVANCE_COUNT) {
  const eligible = standingRows.filter(
    (r) => !r.disqualified && overrides[r.playerId] !== 'out',
  );
  const forcedIn = eligible.filter((r) => overrides[r.playerId] === 'in');
  const rest = eligible.filter((r) => overrides[r.playerId] !== 'in');
  const remaining = Math.max(0, count - forcedIn.length);
  return [...forcedIn, ...rest.slice(0, remaining)]
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)) // 시드 안정화
    .slice(0, count);
}

/** 스위스 최종 순위 → 상위 시드 [{seed, playerId}] (오버라이드 반영) */
export function seedEntrants(standingRows, count = ADVANCE_COUNT, overrides = {}) {
  return selectEntrants(standingRows, overrides, count).map((r, i) => ({
    seed: i + 1,
    playerId: r.playerId,
  }));
}

function gameColors(highId, lowId, gameNo) {
  return gameNo === 1
    ? { whitePlayerId: highId, blackPlayerId: lowId }
    : { whitePlayerId: lowId, blackPlayerId: highId };
}

function newGame(highId, lowId, gameNo) {
  return {
    gameNo,
    ...gameColors(highId, lowId, gameNo),
    result: 'pending', // 'high_win' | 'low_win' | 'draw'
    gameUrl: null,
    pgn: null,
    resultSource: null,
    verified: false,
    flagged: false,
  };
}

export function newMatch(stage, slot, high, low) {
  return {
    id: `KO_${stage}_${slot}`,
    stage,
    slot,
    seedHigh: high.seed,
    seedLow: low.seed,
    playerHighId: high.playerId,
    playerLowId: low.playerId,
    games: [newGame(high.playerId, low.playerId, 1), newGame(high.playerId, low.playerId, 2)],
    armageddon: null, // { whitePlayerId, blackPlayerId, result:'pending'|'high_win'|'low_win', ... }
    winnerId: null,
    status: 'pending', // 'pending' | 'active' | 'decided'
  };
}

/**
 * 첫 스테이지 매치: 크로스오버 페어링(상위절반 i vs 하위절반 i+half).
 * 16강이면 1v9·2v10·…·8v16 — 모든 매치 시드차가 8로 균일해 1라운드 실력 편차/블로아웃을 완화.
 * (폴드 1v16…은 상위 매치 편차가 극단적이라 변경. 다음 스테이지는 createNextStageMatches 가 시드순 재폴드로 상위 시드 보호.)
 */
export function createInitialMatches(stage, entrants) {
  const half = Math.floor(entrants.length / 2);
  const matches = [];
  for (let i = 0; i < half; i += 1) {
    matches.push(newMatch(stage, i, entrants[i], entrants[i + half]));
  }
  return matches;
}

/** 미니매치 2판 합산 점수 {high, low} */
export function matchScore(match) {
  let high = 0;
  let low = 0;
  for (const g of match.games) {
    if (g.result === 'high_win') high += 1;
    else if (g.result === 'low_win') low += 1;
    else if (g.result === 'draw') {
      high += 0.5;
      low += 0.5;
    }
  }
  return { high, low };
}

export function gamesPlayed(match) {
  return match.games.filter((g) => g.result !== 'pending').length;
}

/**
 * 매치 상태/승자 판정 (순수). 반환만 하고 변경은 호출부에서.
 * @returns {{status:'active'|'decided', winnerId:string|null, needArmageddon:boolean}}
 */
export function evaluateMatch(match) {
  if (gamesPlayed(match) < match.games.length) {
    return { status: 'active', winnerId: null, needArmageddon: false };
  }
  const { high, low } = matchScore(match);
  if (high !== low) {
    return {
      status: 'decided',
      winnerId: high > low ? match.playerHighId : match.playerLowId,
      needArmageddon: false,
    };
  }
  // 동점 → 아마게돈
  if (!match.armageddon || match.armageddon.result === 'pending') {
    return { status: 'active', winnerId: null, needArmageddon: true };
  }
  return {
    status: 'decided',
    winnerId: match.armageddon.result === 'high_win' ? match.playerHighId : match.playerLowId,
    needArmageddon: false,
  };
}

export function isStageComplete(matches) {
  return matches.length > 0 && matches.every((m) => m.status === 'decided');
}

/**
 * 다음 스테이지 매치: 승자들을 시드순 정렬 후 폴드 페어링(최상위 vs 최하위).
 * 인접 페어링이 아니라 폴드라야 상위 시드가 보호됨
 *  → 8강 1v8·2v7·3v6·4v5 → 4강 1v4·2v3 → 결승 1v2 (시드1·2는 결승에서만 만남).
 */
export function createNextStageMatches(stage, prevMatches, playerSeed) {
  const winners = prevMatches
    .map((m) => ({ playerId: m.winnerId, seed: playerSeed.get(m.winnerId) ?? 99 }))
    .sort((a, b) => a.seed - b.seed);
  const n = winners.length;
  const matches = [];
  for (let i = 0; i < Math.floor(n / 2); i += 1) {
    const [high, low] = [winners[i], winners[n - 1 - i]];
    matches.push(newMatch(stage, i, high, low));
  }
  return matches;
}

/** 아마게돈 스텁 생성 (high=백) */
export function newArmageddon(match) {
  return {
    whitePlayerId: match.playerHighId,
    blackPlayerId: match.playerLowId,
    result: 'pending', // 'high_win' | 'low_win'
    gameUrl: null,
    pgn: null,
    resultSource: null,
    verified: false,
    flagged: false,
  };
}
