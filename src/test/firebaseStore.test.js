import { describe, it, expect, vi, beforeEach } from 'vitest';

// firebase 의존성은 전부 가짜로 대체 — 라이브 Firestore 접근 없이 "어떤 읽기를 하는지"만 검증.
vi.mock('../data/firebase.js', () => ({
  getFirebase: () => ({ db: {} }),
  ensureAuth: () => Promise.resolve(null),
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ kind: 'collection', name }),
  doc: (_db, coll, id) => ({ kind: 'doc', coll, id }),
  where: (field, op, val) => ({ field, op, val }),
  query: (coll, ...constraints) => ({ kind: 'query', name: coll.name, constraints }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
}));

import { getDoc, getDocs } from 'firebase/firestore';
import { createFirebaseStore } from '../data/firebaseStore.js';

const docs = (arr) => ({ docs: arr.map((x) => ({ data: () => x })) });

beforeEach(() => {
  getDoc.mockReset();
  getDocs.mockReset();

  getDoc.mockImplementation((ref) => {
    if (ref.coll === 'meta' && ref.id === 'tournament')
      return Promise.resolve({ exists: () => true, data: () => ({ currentRoundId: 'R3', knockoutStage: null }) });
    if (ref.coll === 'meta' && ref.id === 'standings')
      return Promise.resolve({ exists: () => true, data: () => ({ rows: [] }) });
    if (ref.coll === 'rounds' && ref.id === 'R3')
      return Promise.resolve({ exists: () => true, data: () => ({ id: 'R3' }) });
    return Promise.resolve({ exists: () => false, data: () => null });
  });

  getDocs.mockImplementation((ref) => {
    if (ref.name === 'players') return Promise.resolve(docs([{ id: 'a' }, { id: 'b' }]));
    if (ref.kind === 'query' && ref.name === 'pairings')
      return Promise.resolve(docs([{ id: 'p1', roundId: 'R3' }, { id: 'p2', roundId: 'R3' }]));
    if (ref.name === 'rounds') return Promise.resolve(docs([{ id: 'R1' }, { id: 'R2' }, { id: 'R3' }]));
    if (ref.name === 'pairings') return Promise.resolve(docs([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]));
    if (ref.name === 'matches') return Promise.resolve(docs([]));
    if (ref.name === 'reviewQueue') return Promise.resolve(docs([{ id: 'rq1' }]));
    return Promise.resolve(docs([]));
  });
});

const fullScanNames = () =>
  getDocs.mock.calls.map((c) => c[0]).filter((r) => r.kind === 'collection').map((r) => r.name);

describe('firebaseStore.loadAll — 스코프', () => {
  it('light: 현재 라운드/대진만 읽고 과거 컬렉션 전량 스캔 안 함', async () => {
    const base = await createFirebaseStore().loadAll({ full: false });

    expect(base.players.map((p) => p.id)).toEqual(['a', 'b']);
    expect(base.rounds).toEqual([{ id: 'R3' }]); // 현재 라운드 1개만(getDoc)
    expect(base.pairings.map((p) => p.id)).toEqual(['p1', 'p2']); // where 쿼리 결과
    expect(base.reviewQueue).toEqual([]); // 비공개
    expect(base.matches).toEqual([]); // knockoutStage 없음 → 매치 쿼리 안 함

    const scans = fullScanNames();
    expect(scans).toContain('players');
    expect(scans).not.toContain('rounds');
    expect(scans).not.toContain('pairings');
    expect(scans).not.toContain('matches');
    expect(scans).not.toContain('reviewQueue');
  });

  it('full: 모든 컬렉션을 전량 로드', async () => {
    const base = await createFirebaseStore().loadAll({ full: true });

    const scans = fullScanNames();
    expect(scans).toEqual(
      expect.arrayContaining(['players', 'rounds', 'pairings', 'matches', 'reviewQueue']),
    );
    expect(base.reviewQueue.map((r) => r.id)).toEqual(['rq1']);
    expect(base.rounds.map((r) => r.id)).toEqual(['R1', 'R2', 'R3']);
  });

  it('인자 없이 호출하면 기본 full', async () => {
    await createFirebaseStore().loadAll();
    expect(fullScanNames()).toContain('reviewQueue');
  });
});
