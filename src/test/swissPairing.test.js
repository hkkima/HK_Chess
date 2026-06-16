import { describe, it, expect } from 'vitest';
import { generateSwissPairings } from '../domain/swissPairing.js';

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    chessUsername: `user${i}`,
    skill: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C',
    rating: 800 + i * 10, // 서로 다른 레이팅 → 결정적 시드
    status: 'confirmed',
    absenceCount: 0,
  }));
}

/** 대진에 등장한 모든 플레이어 id (BOT 제외) */
function playersInPairings(pairings) {
  const ids = [];
  for (const pr of pairings) {
    if (pr.whitePlayerId !== 'BOT') ids.push(pr.whitePlayerId);
    if (pr.blackPlayerId !== 'BOT') ids.push(pr.blackPlayerId);
  }
  return ids;
}

describe('generateSwissPairings — 1라운드', () => {
  it('23명(홀수)이면 11개 일반 대진 + 1개 봇 게임 = 12개', () => {
    const players = makePlayers(23);
    const pairings = generateSwissPairings({ players, pastPairings: [], roundIndex: 1, roundId: 'r1' });
    expect(pairings).toHaveLength(12);
    expect(pairings.filter((p) => p.isBotGame)).toHaveLength(1);
  });

  it('모든 참가자가 정확히 한 번씩만 배정된다', () => {
    const players = makePlayers(23);
    const pairings = generateSwissPairings({ players, pastPairings: [], roundIndex: 1, roundId: 'r1' });
    const ids = playersInPairings(pairings);
    expect(ids).toHaveLength(23);
    expect(new Set(ids).size).toBe(23);
  });

  it('짝수 인원이면 봇 게임이 없다', () => {
    const players = makePlayers(8);
    const pairings = generateSwissPairings({ players, pastPairings: [], roundIndex: 1, roundId: 'r1' });
    expect(pairings.filter((p) => p.isBotGame)).toHaveLength(0);
    expect(pairings).toHaveLength(4);
  });
});

describe('generateSwissPairings — 2라운드 이후', () => {
  it('직전 라운드에서 만난 상대와는 다시 붙지 않는다(가능한 경우)', () => {
    const players = makePlayers(8);
    const r1 = generateSwissPairings({ players, pastPairings: [], roundIndex: 1, roundId: 'r1' });
    // r1 결과를 임의로 채움
    r1.forEach((p) => {
      p.result = 'white_win';
    });
    const r2 = generateSwissPairings({ players, pastPairings: r1, roundIndex: 2, roundId: 'r2' });

    const metBefore = new Set();
    r1.forEach((p) => metBefore.add([p.whitePlayerId, p.blackPlayerId].sort().join('|')));
    let rematches = 0;
    r2.forEach((p) => {
      const key = [p.whitePlayerId, p.blackPlayerId].sort().join('|');
      if (metBefore.has(key)) rematches += 1;
    });
    expect(rematches).toBe(0);
  });

  it('여러 라운드를 돌려도 매 라운드 전원이 한 번씩 배정된다', () => {
    const players = makePlayers(23);
    let past = [];
    for (let round = 1; round <= 6; round += 1) {
      const pr = generateSwissPairings({
        players,
        pastPairings: past,
        roundIndex: round,
        roundId: `r${round}`,
      });
      const ids = playersInPairings(pr);
      expect(new Set(ids).size).toBe(23);
      pr.forEach((p) => {
        p.result = 'white_win';
      });
      past = past.concat(pr);
    }
  });
});

describe('흑백 균형', () => {
  it('여러 라운드 후 누적 백/흑 차이가 과도하지 않다(±2 이내)', () => {
    const players = makePlayers(16);
    let past = [];
    for (let round = 1; round <= 8; round += 1) {
      const pr = generateSwissPairings({
        players,
        pastPairings: past,
        roundIndex: round,
        roundId: `r${round}`,
      });
      pr.forEach((p) => {
        p.result = 'draw';
      });
      past = past.concat(pr);
    }
    const counts = {};
    players.forEach((p) => (counts[p.id] = { w: 0, b: 0 }));
    past.forEach((pr) => {
      if (counts[pr.whitePlayerId]) counts[pr.whitePlayerId].w += 1;
      if (counts[pr.blackPlayerId]) counts[pr.blackPlayerId].b += 1;
    });
    Object.values(counts).forEach(({ w, b }) => {
      expect(Math.abs(w - b)).toBeLessThanOrEqual(2);
    });
  });
});
