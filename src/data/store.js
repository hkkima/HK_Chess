// 저장소 선택 (DESIGN 11장).
// VITE_STORE=firebase 면 Firestore, 아니면 localStorage(기본).
// 같은 인터페이스(loadAll/sync/clear) 라 AppContext 는 어느 쪽인지 몰라도 됨.

import { createLocalStore } from './localStore.js';
import { createFirebaseStore } from './firebaseStore.js';

export function createStore() {
  const mode = import.meta.env.VITE_STORE === 'firebase' ? 'firebase' : 'local';
  return mode === 'firebase' ? createFirebaseStore() : createLocalStore();
}
