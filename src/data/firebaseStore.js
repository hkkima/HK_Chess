// Firestore 어댑터 (2차). localStore 와 동일한 인터페이스(loadAll/sync/clear).
//
// 컬렉션 매핑 (DESIGN 4장):
//   meta/tournament, meta/standings   (단일 문서)
//   players/{id}, rounds/{id}, pairings/{id}, reviewQueue/{id}  (컬렉션)
//
// sync(prev, next): prev↔next 를 비교해 바뀐 문서만 기록(전체 덮어쓰기 X).
//   → 참가자가 동시에 결과를 내도 자기 대진 문서만 써서 서로 덮어쓰지 않음.
//   → 순위/대진 등 화면 읽기는 컬렉션 단위로 최소화(DESIGN 9장).

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirebase, ensureAuth } from './firebase.js';
import { defaultDb } from './localStore.js';

const COLLECTIONS = ['players', 'rounds', 'pairings', 'matches', 'reviewQueue'];

function changed(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function diffCollection(batch, db, name, prevArr = [], nextArr = []) {
  const prevMap = new Map(prevArr.map((x) => [x.id, x]));
  const nextMap = new Map(nextArr.map((x) => [x.id, x]));
  for (const [id, val] of nextMap) {
    const old = prevMap.get(id);
    if (!old || changed(old, val)) batch.set(doc(db, name, id), val);
  }
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) batch.delete(doc(db, name, id));
  }
}

export function createFirebaseStore() {
  return {
    mode: 'firebase',

    // full=true(운영자): 전체 컬렉션 로드. full=false(공개/참가자): 화면에 필요한
    // 현재 라운드/스테이지 범위만 로드해 읽기량을 상수로 낮춘다(쓰기 모델은 동일).
    async loadAll({ full = true } = {}) {
      await ensureAuth();
      const { db } = getFirebase();
      const base = defaultDb();

      const tSnap = await getDoc(doc(db, 'meta', 'tournament'));
      if (tSnap.exists()) base.tournament = tSnap.data();
      const sSnap = await getDoc(doc(db, 'meta', 'standings'));
      if (sSnap.exists()) base.standings = sSnap.data();

      // players 는 이름 표시에 항상 필요(23명 상수).
      const pSnap = await getDocs(collection(db, 'players'));
      base.players = pSnap.docs.map((d) => d.data());

      if (full) {
        for (const name of ['rounds', 'pairings', 'matches', 'reviewQueue']) {
          const snap = await getDocs(collection(db, name));
          base[name] = snap.docs.map((d) => d.data());
        }
        return base;
      }

      // light: 현재 라운드 1개 + 그 대진만, 녹아웃이면 현재 스테이지 매치만.
      const t = base.tournament;
      if (t.currentRoundId) {
        const rSnap = await getDoc(doc(db, 'rounds', t.currentRoundId));
        base.rounds = rSnap.exists() ? [rSnap.data()] : [];
        const pq = await getDocs(
          query(collection(db, 'pairings'), where('roundId', '==', t.currentRoundId)),
        );
        base.pairings = pq.docs.map((d) => d.data());
      }
      if (t.knockoutStage) {
        const mq = await getDocs(
          query(collection(db, 'matches'), where('stage', '==', t.knockoutStage)),
        );
        base.matches = mq.docs.map((d) => d.data());
      }
      base.reviewQueue = []; // 비공개 — 운영자 full 로드에서만 채움
      return base;
    },

    async sync(prev, next) {
      await ensureAuth();
      const { db } = getFirebase();
      const batch = writeBatch(db);

      if (changed(prev.tournament, next.tournament)) {
        batch.set(doc(db, 'meta', 'tournament'), next.tournament);
      }
      if (changed(prev.standings, next.standings)) {
        batch.set(doc(db, 'meta', 'standings'), next.standings);
      }
      for (const name of COLLECTIONS) {
        diffCollection(batch, db, name, prev[name], next[name]);
      }
      await batch.commit();
    },

    async clear() {
      await ensureAuth();
      const { db } = getFirebase();
      for (const name of COLLECTIONS) {
        const snap = await getDocs(collection(db, name));
        if (snap.empty) continue;
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      const batch = writeBatch(db);
      batch.delete(doc(db, 'meta', 'tournament'));
      batch.delete(doc(db, 'meta', 'standings'));
      await batch.commit();
    },
  };
}
