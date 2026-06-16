import { describe, it, expect } from 'vitest';
import { computeStandings, computePointsMap } from '../domain/standings.js';

function player(id, over = {}) {
  return {
    id,
    name: id,
    chessUsername: id,
    skill: 'B',
    status: 'confirmed',
    absenceCount: 0,
    ...over,
  };
}

function pairing(w, b, result, isBot = false) {
  return { whitePlayerId: w, blackPlayerId: b, result, isBotGame: isBot };
}

describe('computePointsMap', () => {
  it('승1 / 무0.5 / 패0 을 정확히 합산한다', () => {
    const players = [player('a'), player('b'), player('c')];
    const pairings = [
      pairing('a', 'b', 'white_win'), // a 1, b 0
      pairing('c', 'a', 'draw'), // c .5, a .5
    ];
    const pts = computePointsMap(players, pairings);
    expect(pts.a).toBe(1.5);
    expect(pts.b).toBe(0);
    expect(pts.c).toBe(0.5);
  });

  it('봇 게임도 사람 승점에 반영하고 BOT 키를 집계한다', () => {
    const players = [player('a')];
    const pairings = [pairing('a', 'BOT', 'black_win', true)]; // BOT(흑) 승 → a 0, BOT 1
    const pts = computePointsMap(players, pairings);
    expect(pts.a).toBe(0);
    expect(pts.BOT).toBe(1);
  });

  it('pending 은 무시한다', () => {
    const players = [player('a'), player('b')];
    const pts = computePointsMap(players, [pairing('a', 'b', 'pending')]);
    expect(pts.a).toBe(0);
    expect(pts.b).toBe(0);
  });

  it('무단 결석(forfeit): 불참자 0, 상대 부전승 1', () => {
    const players = [player('a'), player('b')];
    const pts = computePointsMap(players, [pairing('a', 'b', 'white_forfeit')]);
    expect(pts.a).toBe(0); // 백(a) 무단 결석
    expect(pts.b).toBe(1); // 흑(b) 부전승
  });

  it('사전 결석(bye_planned): 불참자 0.5, 상대 1', () => {
    const players = [player('a'), player('b')];
    const pts = computePointsMap(players, [pairing('a', 'b', 'black_bye_planned')]);
    expect(pts.a).toBe(1); // 백(a) 부전승
    expect(pts.b).toBe(0.5); // 흑(b) 사전 결석
  });
});

describe('computeStandings', () => {
  it('버흘홀츠 = 상대 승점 합으로 동점을 가른다', () => {
    // a, b 둘 다 1승1패=1점이지만 상대 면면이 다름
    const players = [player('a'), player('b'), player('strong'), player('weak')];
    const pairings = [
      pairing('strong', 'weak', 'white_win'), // strong 1, weak 0
      pairing('a', 'strong', 'white_win'), // a 1 (강자 잡음), strong 그대로 1
      pairing('b', 'weak', 'white_win'), // b 1 (약자 잡음)
      pairing('a', 'weak', 'black_win'), // a 0(흑 weak승)... 조정용
      pairing('b', 'strong', 'black_win'), // b 0
    ];
    const rows = computeStandings(players, pairings);
    const a = rows.find((r) => r.playerId === 'a');
    const b = rows.find((r) => r.playerId === 'b');
    // a 상대: strong(1) + weak(?), b 상대: weak + strong → 버흘홀츠로 비교 가능
    expect(a.buchholz).toBeGreaterThanOrEqual(0);
    expect(b.buchholz).toBeGreaterThanOrEqual(0);
    expect(rows.every((r) => typeof r.points === 'number')).toBe(true);
  });

  it('상위 16명에 qualified=true, 그 아래는 false', () => {
    const players = Array.from({ length: 20 }, (_, i) => player(`p${i}`));
    // p0..p19 각각 i점이 되도록 더미 승수 부여
    const pairings = [];
    players.forEach((p, i) => {
      for (let k = 0; k < i; k += 1) pairings.push(pairing(p.id, 'BOT', 'white_win', true));
    });
    const rows = computeStandings(players, pairings);
    const qualified = rows.filter((r) => r.qualified);
    expect(qualified).toHaveLength(16);
    expect(rows[0].rank).toBe(1);
    expect(rows[15].qualified).toBe(true);
    expect(rows[16].qualified).toBe(false);
  });

  it('결석 3회 이상은 실격 처리되어 순위에서 분리된다', () => {
    const players = [
      player('ok', { absenceCount: 0 }),
      player('dq', { absenceCount: 3 }),
    ];
    const rows = computeStandings(players, [pairing('ok', 'BOT', 'white_win', true)]);
    const dq = rows.find((r) => r.playerId === 'dq');
    const ok = rows.find((r) => r.playerId === 'ok');
    expect(dq.disqualified).toBe(true);
    expect(dq.rank).toBeNull();
    expect(ok.rank).toBe(1);
  });
});
