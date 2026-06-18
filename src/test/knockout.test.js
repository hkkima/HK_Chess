import { describe, it, expect } from 'vitest';
import {
  seedEntrants,
  selectEntrants,
  startingStageFor,
  createInitialMatches,
  matchScore,
  evaluateMatch,
  isStageComplete,
  createNextStageMatches,
  newArmageddon,
  nextStage,
} from '../domain/knockout.js';

function standings(n) {
  return Array.from({ length: n }, (_, i) => ({
    playerId: `p${i + 1}`,
    rank: i + 1,
    qualified: i < 16,
    disqualified: false,
  }));
}

describe('seedEntrants', () => {
  it('상위 16명만, 순위대로 시드 1~16', () => {
    const e = seedEntrants(standings(20));
    expect(e).toHaveLength(16);
    expect(e[0]).toEqual({ seed: 1, playerId: 'p1' });
    expect(e[15]).toEqual({ seed: 16, playerId: 'p16' });
  });
});

describe('seedEntrants — 확정 진출/탈락 오버라이드 (항상 16명 유지)', () => {
  it('확정탈락: 순위 16위 이내여도 제외되고 다음 순위가 슬롯을 승계', () => {
    const e = seedEntrants(standings(20), 16, { p1: 'out' });
    const ids = e.map((x) => x.playerId);
    expect(e).toHaveLength(16);
    expect(ids).not.toContain('p1'); // 1위였지만 제외
    expect(ids).toContain('p17'); // 다음 순위가 승계
    expect(e[0]).toEqual({ seed: 1, playerId: 'p2' });
  });

  it('확정진출: 순위 16위 밖이어도 포함되고 최하위 자동진출자를 밀어냄', () => {
    const e = seedEntrants(standings(20), 16, { p20: 'in' });
    const ids = e.map((x) => x.playerId);
    expect(e).toHaveLength(16);
    expect(ids).toContain('p20'); // 20위였지만 강제 진출
    expect(ids).not.toContain('p16'); // 최하위 자동진출자 탈락
    expect(e[15]).toEqual({ seed: 16, playerId: 'p20' }); // 시드는 순위순(맨 끝)
  });

  it('진출+탈락 동시 적용해도 정확히 16명', () => {
    const e = seedEntrants(standings(30), 16, { p1: 'out', p25: 'in', p26: 'in' });
    const ids = e.map((x) => x.playerId);
    expect(e).toHaveLength(16);
    expect(ids).not.toContain('p1');
    expect(ids).toContain('p25');
    expect(ids).toContain('p26');
  });

  it('오버라이드가 없으면 기존 동작(상위 16)과 동일', () => {
    expect(seedEntrants(standings(20), 16, {})).toEqual(seedEntrants(standings(20)));
  });

  it('selectEntrants: 실격자는 오버라이드와 무관히 제외', () => {
    const rows = standings(18);
    rows[2].disqualified = true; // p3 실격
    const chosen = selectEntrants(rows, { p3: 'in' }, 16).map((r) => r.playerId);
    expect(chosen).not.toContain('p3');
    expect(chosen).toHaveLength(16);
  });
});

describe('createInitialMatches', () => {
  it('16명 → 8매치, 1v16 · 2v15 … 8v9', () => {
    const e = seedEntrants(standings(16));
    const m = createInitialMatches('16강', e);
    expect(m).toHaveLength(8);
    expect([m[0].seedHigh, m[0].seedLow]).toEqual([1, 16]);
    expect([m[1].seedHigh, m[1].seedLow]).toEqual([2, 15]);
    expect([m[7].seedHigh, m[7].seedLow]).toEqual([8, 9]);
  });

  it('1판 high=백, 2판 high=흑 (흑백 교대)', () => {
    const m = createInitialMatches('결승', seedEntrants(standings(2)))[0];
    expect(m.games[0].whitePlayerId).toBe(m.playerHighId);
    expect(m.games[1].whitePlayerId).toBe(m.playerLowId);
  });
});

describe('evaluateMatch', () => {
  function match() {
    return createInitialMatches('결승', seedEntrants(standings(2)))[0];
  }

  it('2판 전 → active', () => {
    const m = match();
    m.games[0].result = 'high_win';
    expect(evaluateMatch(m).status).toBe('active');
  });

  it('2:0 → high 승 확정', () => {
    const m = match();
    m.games[0].result = 'high_win';
    m.games[1].result = 'high_win';
    const r = evaluateMatch(m);
    expect(r.status).toBe('decided');
    expect(r.winnerId).toBe(m.playerHighId);
  });

  it('1.5:0.5(승+무) → high 승', () => {
    const m = match();
    m.games[0].result = 'high_win';
    m.games[1].result = 'draw';
    const r = evaluateMatch(m);
    expect(r.status).toBe('decided');
    expect(r.winnerId).toBe(m.playerHighId);
  });

  it('1:1 → 아마게돈 필요', () => {
    const m = match();
    m.games[0].result = 'high_win';
    m.games[1].result = 'low_win';
    const r = evaluateMatch(m);
    expect(r.status).toBe('active');
    expect(r.needArmageddon).toBe(true);
  });

  it('아마게돈 결과로 승자 확정', () => {
    const m = match();
    m.games[0].result = 'draw';
    m.games[1].result = 'draw';
    m.armageddon = newArmageddon(m);
    m.armageddon.result = 'low_win';
    const r = evaluateMatch(m);
    expect(r.status).toBe('decided');
    expect(r.winnerId).toBe(m.playerLowId);
  });
});

describe('전체 브래킷 시뮬레이션 (16 → 우승)', () => {
  it('매 스테이지마다 high가 2:0으로 이기면 시드1이 우승', () => {
    const seedMap = new Map(seedEntrants(standings(16)).map((e) => [e.playerId, e.seed]));
    let stage = startingStageFor(16); // '16강'
    let matches = createInitialMatches(stage, seedEntrants(standings(16)));
    let guard = 0;

    while (true) {
      guard += 1;
      if (guard > 10) throw new Error('무한 루프');
      // high 전원 2:0 승
      matches.forEach((m) => {
        m.games[0].result = 'high_win';
        m.games[1].result = 'high_win';
        const r = evaluateMatch(m);
        m.status = r.status;
        m.winnerId = r.winnerId;
      });
      expect(isStageComplete(matches)).toBe(true);
      const ns = nextStage(stage);
      if (!ns) break;
      matches = createNextStageMatches(ns, matches, seedMap);
      stage = ns;
    }
    expect(stage).toBe('결승');
    expect(matches).toHaveLength(1);
    expect(matches[0].winnerId).toBe('p1'); // 시드1 우승
  });
});

describe('matchScore', () => {
  it('승=1, 무=0.5 합산', () => {
    const m = createInitialMatches('결승', seedEntrants(standings(2)))[0];
    m.games[0].result = 'high_win';
    m.games[1].result = 'draw';
    expect(matchScore(m)).toEqual({ high: 1.5, low: 0.5 });
  });
});
