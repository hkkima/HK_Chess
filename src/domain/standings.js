// 순위 집계 (DESIGN 5.3)
//  - 누적 승점 (승1 / 무0.5 / 패0)
//  - 버흘홀츠 = 상대들의 누적 승점 합 (봇은 'BOT' 가상 플레이어로 취급)
//  - 정렬: 승점↓ → 버흘홀츠↓ → 결석↑ → 이름
//  - 실격자는 하단으로 분리, 진출선(상위 16)은 비실격 기준

import { ADVANCE_COUNT, ABSENCE } from './rules.js';

/** result 문자열 → [백 득점, 흑 득점] */
function resultPoints(result) {
  switch (result) {
    case 'white_win':
      return [1, 0];
    case 'black_win':
      return [0, 1];
    case 'draw':
      return [0.5, 0.5];
    // 결석 처리 (DESIGN 결석 규칙)
    case 'white_forfeit': // 백 무단 결석 → 백 0, 흑 부전승 1
      return [0, 1];
    case 'black_forfeit':
      return [1, 0];
    case 'white_bye_planned': // 백 사전신고 결석 → 백 0.5, 흑 부전승 1
      return [0.5, 1];
    case 'black_bye_planned':
      return [1, 0.5];
    default:
      return [0, 0]; // pending 등
  }
}

/**
 * 플레이어별 누적 승점 맵. 'BOT'도 가상 키로 함께 집계(버흘홀츠용).
 * @param {import('./types.js').Player[]} players
 * @param {import('./types.js').Pairing[]} pairings
 * @returns {Record<string, number>}
 */
export function computePointsMap(players, pairings) {
  /** @type {Record<string, number>} */
  const points = { BOT: 0 };
  for (const p of players) points[p.id] = 0;

  for (const pr of pairings) {
    if (pr.result === 'pending') continue;
    const [wp, bp] = resultPoints(pr.result);
    if (pr.whitePlayerId in points) points[pr.whitePlayerId] += wp;
    if (pr.blackPlayerId in points) points[pr.blackPlayerId] += bp;
  }
  return points;
}

/** 플레이어별 상대 목록 (버흘홀츠 계산용). 'BOT' 포함, pending 제외. */
function buildOpponents(players, pairings) {
  /** @type {Record<string, string[]>} */
  const opp = {};
  for (const p of players) opp[p.id] = [];
  for (const pr of pairings) {
    if (pr.result === 'pending') continue;
    if (pr.whitePlayerId in opp) opp[pr.whitePlayerId].push(pr.blackPlayerId);
    if (pr.blackPlayerId in opp) opp[pr.blackPlayerId].push(pr.whitePlayerId);
  }
  return opp;
}

/**
 * 전체 순위 행 계산.
 * @param {import('./types.js').Player[]} players
 * @param {import('./types.js').Pairing[]} pairings
 * @returns {import('./types.js').StandingRow[]}
 */
export function computeStandings(players, pairings) {
  const points = computePointsMap(players, pairings);
  const opponents = buildOpponents(players, pairings);

  const rows = players.map((p) => {
    const buchholz = opponents[p.id].reduce((s, oid) => s + (points[oid] ?? 0), 0);
    const absences = p.absenceCount ?? 0;
    const disqualified = p.status === 'disqualified' || absences >= ABSENCE.dqThreshold;
    return {
      playerId: p.id,
      name: p.name,
      chessUsername: p.chessUsername,
      points: points[p.id] ?? 0,
      buchholz,
      absences,
      rank: null,
      qualified: false,
      disqualified,
    };
  });

  rows.sort((a, b) => {
    if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
    if (b.points !== a.points) return b.points - a.points;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    if (a.absences !== b.absences) return a.absences - b.absences;
    return a.name.localeCompare(b.name, 'ko');
  });

  let rank = 0;
  for (const row of rows) {
    if (row.disqualified) {
      row.rank = null;
      row.qualified = false;
    } else {
      rank += 1;
      row.rank = rank;
      row.qualified = rank <= ADVANCE_COUNT;
    }
  }
  return rows;
}
