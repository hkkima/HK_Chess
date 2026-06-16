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

    async loadAll() {
      await ensureAuth();
      const { db } = getFirebase();
      const base = defaultDb();

      const tSnap = await getDoc(doc(db, 'meta', 'tournament'));
      if (tSnap.exists()) base.tournament = tSnap.data();
      const sSnap = await getDoc(doc(db, 'meta', 'standings'));
      if (sSnap.exists()) base.standings = sSnap.data();

      for (const name of COLLECTIONS) {
        const snap = await getDocs(collection(db, name));
        base[name] = snap.docs.map((d) => d.data());
      }
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
