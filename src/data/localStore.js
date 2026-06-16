// localStorage 기반 저장소 (MVP 기본, DESIGN 11장)
// MVP는 단순함을 위해 DB 전체를 한 덩이로 읽고/쓴다(23명 규모라 충분).
// 2차에서 같은 데이터 모양 그대로 firebaseStore 로 교체 예정.

const KEY = 'chess_tournament_db_v1';

export function defaultDb() {
  return {
    tournament: {
      phase: 'registration', // registration | swiss | knockout | finished
      currentDay: 1,
      currentRoundIndex: 0,
      currentRoundId: null,
      knockoutStage: null, // '16강' | '8강' | '4강' | '결승' | null
      championId: null,
      registrationOpen: true,
      rosterConfirmed: false,
      config: {
        totalPlayers: 23,
        swissRounds: 16,
        advanceCount: 16,
        botDay1Rating: 1000,
        absenceLimitForDQ: 3,
      },
    },
    players: [],
    rounds: [],
    pairings: [],
    matches: [], // 녹아웃 미니매치 (3차)
    standings: { asOfRoundIndex: 0, rows: [], updatedAt: 0 },
    reviewQueue: [], // Chess.com 검증 실패/수동 확인 대기 (DESIGN 4.8)
  };
}

export function loadDb() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultDb();
    return { ...defaultDb(), ...JSON.parse(raw) };
  } catch {
    return defaultDb();
  }
}

export function saveDb(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function resetDb() {
  localStorage.removeItem(KEY);
}

// 저장 이음새 어댑터 (DESIGN 11장). firebaseStore 와 같은 인터페이스.
//  - loadAll(): 전체 DB 로드
//  - sync(prev, next): 변경분 영속화 (로컬은 통째로 저장)
//  - clear(): 전부 삭제
export function createLocalStore() {
  return {
    mode: 'local',
    async loadAll() {
      return loadDb();
    },
    async sync(_prev, next) {
      saveDb(next);
    },
    async clear() {
      resetDb();
    },
  };
}
