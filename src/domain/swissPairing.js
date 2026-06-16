// 스위스 페어링 엔진 (DESIGN 5.2)
//
// 1R: effectiveRating 내림차순 시드 → 상/하위 폴드 매칭(#1 vs 중위권)으로 극단 대진 완화.
// 2R+: 승점 내림차순 정렬(동점은 레이팅) → 위에서부터 그리디 매칭.
//      - 재매칭 회피(이미 만난 상대는 건너뜀, 막히면 완화).
//      - 흑백 균형: 누적 색 차이가 0에 가깝도록 백/흑 배정.
// 홀수(23명): 매칭 안 되는 1명 → 봇 배정(봇 미경험·하위 우선).

import { effectiveRating } from './ratings.js';
import { computePointsMap } from './standings.js';

/** 플레이어별 색/상대/봇 이력 집계 */
function buildHistory(players, pairings) {
  /** @type {Record<string, {opponents:string[], whiteCount:number, blackCount:number, hadBot:boolean, lastColor:string|null}>} */
  const h = {};
  for (const p of players) {
    h[p.id] = { opponents: [], whiteCount: 0, blackCount: 0, hadBot: false, lastColor: null };
  }
  for (const pr of pairings) {
    const w = pr.whitePlayerId;
    const b = pr.blackPlayerId;
    if (h[w]) {
      h[w].whiteCount += 1;
      h[w].lastColor = 'white';
      h[w].opponents.push(b);
      if (b === 'BOT') h[w].hadBot = true;
    }
    if (h[b]) {
      h[b].blackCount += 1;
      h[b].lastColor = 'black';
      h[b].opponents.push(w);
      if (w === 'BOT') h[b].hadBot = true;
    }
  }
  return h;
}

/** 봇과 붙을 1명 선택: 봇 미경험 우선 → 낮은 승점 → 낮은 레이팅 */
function chooseBotPlayer(metas) {
  const sorted = [...metas].sort((a, b) => {
    if (a.hadBot !== b.hadBot) return a.hadBot ? 1 : -1;
    if (a.points !== b.points) return a.points - b.points;
    return a.eff - b.eff;
  });
  return sorted[0];
}

/** 1R 폴드 페어링: 상위 절반 vs 하위 절반 */
function foldPair(ordered) {
  const pairs = [];
  const n = ordered.length;
  const half = Math.floor(n / 2);
  for (let i = 0; i < half; i += 1) {
    pairs.push([ordered[i], ordered[i + half]]);
  }
  return pairs;
}

/** 2R+ 그리디 페어링: 위에서부터, 아직 안 만난 가장 가까운 상대와 매칭 */
function greedyPair(ordered) {
  const pairs = [];
  const used = new Set();
  for (let i = 0; i < ordered.length; i += 1) {
    const a = ordered[i];
    if (used.has(a.id)) continue;
    used.add(a.id);

    let partner = null;
    // 1차: 재매칭 아닌 상대
    for (let j = i + 1; j < ordered.length; j += 1) {
      const b = ordered[j];
      if (used.has(b.id)) continue;
      if (a.opponents.includes(b.id)) continue;
      partner = b;
      break;
    }
    // 완화: 어쩔 수 없으면 재매칭 허용
    if (!partner) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        const b = ordered[j];
        if (used.has(b.id)) continue;
        partner = b;
        break;
      }
    }
    if (partner) {
      used.add(partner.id);
      pairs.push([a, partner]);
    }
  }
  return pairs;
}

/** 두 플레이어의 색 배정 → [백, 흑] */
function assignColors(a, b, roundIndex, board) {
  const aDiff = a.whiteCount - a.blackCount;
  const bDiff = b.whiteCount - b.blackCount;
  // 백이 더 많은(diff 큰) 쪽이 흑을 받음
  if (aDiff > bDiff) return [b, a];
  if (bDiff > aDiff) return [a, b];
  // 동률: 직전 색이 백이면 이번엔 흑
  if (a.lastColor === 'white' && b.lastColor !== 'white') return [b, a];
  if (b.lastColor === 'white' && a.lastColor !== 'white') return [a, b];
  // 그래도 동률: 보드 번호로 교대 (결정적)
  return board % 2 === 0 ? [b, a] : [a, b];
}

function makePairing(roundId, board, whiteId, blackId, isBotGame) {
  return {
    id: `${roundId}_b${board}`,
    roundId,
    board,
    whitePlayerId: whiteId,
    blackPlayerId: blackId,
    isBotGame,
    result: 'pending',
    gameUrl: null,
    resultSource: null,
    verified: false,
    flagged: false,
  };
}

/**
 * 한 라운드의 대진 생성.
 * @param {Object} args
 * @param {import('./types.js').Player[]} args.players  전체 참가자(확정 명단)
 * @param {import('./types.js').Pairing[]} args.pastPairings  지난 라운드들의 대진(이력)
 * @param {number} args.roundIndex  전체 라운드 순번 (1~16)
 * @param {string} args.roundId
 * @returns {import('./types.js').Pairing[]}
 */
export function generateSwissPairings({ players, pastPairings = [], roundIndex, roundId }) {
  const history = buildHistory(players, pastPairings);
  const points = computePointsMap(players, pastPairings);

  const metas = players
    .filter((p) => p.status !== 'disqualified')
    .map((p) => ({
      id: p.id,
      eff: effectiveRating(p),
      points: points[p.id] ?? 0,
      ...history[p.id],
    }));

  // 정렬
  let ordered;
  if (roundIndex === 1) {
    ordered = [...metas].sort((a, b) => b.eff - a.eff || a.id.localeCompare(b.id));
  } else {
    ordered = [...metas].sort(
      (a, b) => b.points - a.points || b.eff - a.eff || a.id.localeCompare(b.id),
    );
  }

  // 홀수 → 봇 1명 분리
  let botPlayer = null;
  if (ordered.length % 2 === 1) {
    botPlayer = chooseBotPlayer(ordered);
    ordered = ordered.filter((p) => p.id !== botPlayer.id);
  }

  const rawPairs = roundIndex === 1 ? foldPair(ordered) : greedyPair(ordered);

  const result = [];
  let board = 1;
  for (const [a, b] of rawPairs) {
    if (!b) continue; // 방어적 처리
    const [white, black] = assignColors(a, b, roundIndex, board);
    result.push(makePairing(roundId, board, white.id, black.id, false));
    board += 1;
  }

  // 봇 게임: 사람의 색 균형에 맞춰 배정
  if (botPlayer) {
    const humanWhite = botPlayer.whiteCount <= botPlayer.blackCount;
    const whiteId = humanWhite ? botPlayer.id : 'BOT';
    const blackId = humanWhite ? 'BOT' : botPlayer.id;
    result.push(makePairing(roundId, board, whiteId, blackId, true));
  }

  return result;
}
