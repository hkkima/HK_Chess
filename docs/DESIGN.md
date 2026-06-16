# 체스 토너먼트 운영 웹앱 — 설계 문서 (DESIGN.md)

> 23명 규모 초심자 체스 대회 운영 시스템.
> **스위스 예선(1~4일차) + 녹아웃 결선(5~8일차)** 자동 운영.
> 참가자 자기등록 · Chess.com URL 결과 검증 · 페어링/순위/진출 자동화.

이 문서는 **코드를 쓰기 전 합의용 설계도**입니다. 폴더 구조 · 데이터 모델 · 도메인 로직 · 화면 · 운영 흐름 · 로드맵을 담습니다.

---

## 목차

1. [설계 원칙](#1-설계-원칙)
2. [기술 스택 & 배포 구조](#2-기술-스택--배포-구조)
3. [폴더 구조](#3-폴더-구조)
4. [데이터 모델 (Firestore 스키마)](#4-데이터-모델-firestore-스키마)
5. [도메인 로직 모듈](#5-도메인-로직-모듈)
6. [화면 / 라우트 설계](#6-화면--라우트-설계)
7. [권한 & 보안 규칙](#7-권한--보안-규칙)
8. [Chess.com 결과 검증 흐름](#8-chesscom-결과-검증-흐름)
9. [Firestore 사용량 최적화 전략](#9-firestore-사용량-최적화-전략)
10. [8일치 운영 타임라인 (상태 머신)](#10-8일치-운영-타임라인-상태-머신)
11. [데이터 저장 이음새 (Storage Adapter)](#11-데이터-저장-이음새-storage-adapter)
12. [로드맵 (MVP → 2차 → 3차)](#12-로드맵-mvp--2차--3차)
13. [열린 질문 / 결정 필요 사항](#13-열린-질문--결정-필요-사항)

---

## 1. 설계 원칙

| 원칙 | 의미 |
|------|------|
| **도메인 로직은 순수하게** | 페어링·순위·버흘홀츠·봇·녹아웃 계산은 React/Firebase를 모르는 순수 함수로. 입력→출력만. 단위 테스트로 보호. |
| **저장소는 갈아끼운다** | `localStorage` ↔ `Firestore`를 같은 인터페이스(adapter)로 추상화. MVP는 로컬, 2차에 Firebase. |
| **읽기/쓰기 최소화** | 파생 데이터(순위·버흘홀츠)는 라운드 마감 시 1번 집계해 요약 문서에 캐싱. 상시 구독(onSnapshot) 지양. |
| **조작 불가** | 결과는 Chess.com URL → Public API 대조로 검증. 불일치는 운영자 플래그. |
| **MVP 먼저** | 등록→페어링→수동입력→순위표가 1순위. 검증·녹아웃·자동화는 단계적으로. |

---

## 2. 기술 스택 & 배포 구조

- **프론트엔드**: React + Vite (정적 빌드 → GitHub Pages 배포)
- **언어**: **JavaScript** (+ JSDoc 타입 주석) — TS 빌드 없이 단순·검증 수월. 도메인 스키마는 JSDoc `@typedef`로 표현. *(아래 4장의 인터페이스 표기는 스키마 설명용이며, 실제 구현은 JS)*
- **상태관리**: 경량으로 React Context + reducer (또는 zustand). 대규모 X.
- **테스트**: Vitest (도메인 로직 단위 테스트)
- **백엔드/DB**: Firebase — Firestore(데이터) + Authentication(운영자/참가자 권한)
- **외부 API**: Chess.com Public API (`https://api.chess.com/pub/...`) — 인증 불필요, 공개 읽기

### 배포 조합

```
GitHub Pages  ──  정적 React 앱 (HTML/JS/CSS)
      │
      └─(브라우저에서 직접 호출)──► Firestore / Firebase Auth
      └─(브라우저에서 직접 호출)──► Chess.com Public API
```

- GitHub Pages는 정적 호스팅이라 **서버 로직이 없음** → 모든 상태는 Firestore에, 검증은 클라이언트에서 Chess.com API 호출.
- **배포 = GitHub Pages + Firebase Hosting 병행 (확정).** 같은 정적 빌드를 양쪽에 올림.
  - Firebase Hosting: Firestore/Auth와 같은 생태계라 연동이 매끄러움 (주 배포처).
  - GitHub Pages: 공개 미러. Vite `base`를 타깃별로 분기 — GH Pages=`/chess-tournament/`, Firebase=`/`.

> ⚠️ **CORS 참고**: Chess.com Public API는 브라우저 직접 호출이 가능하지만, 레이트리밋/일시 차단 시 대비해 결과는 캐싱하고 재시도 로직을 둔다. 차단이 잦으면 2차에서 경량 프록시(Cloud Functions) 옵션을 검토.

---

## 3. 폴더 구조

```
chess-tournament/
├─ docs/
│  └─ DESIGN.md                  ← (이 문서)
├─ index.html
├─ package.json
├─ vite.config.js                ← base 경로(타깃별 분기) / 빌드 설정
├─ jsconfig.json                 ← JS 경로 별칭 / 에디터 인텔리센스
├─ .env.example                  ← Firebase 키 템플릿 (실제 .env는 gitignore)
├─ firebase.json / .firebaserc   ← 2차: Firebase Hosting + Firestore 배포 설정
├─ firestore.rules               ← 2차: 보안 규칙
├─ public/
└─ src/
   ├─ main.jsx
   ├─ App.jsx                    ← 라우팅
   │
   ├─ domain/                    ★ 순수 로직 (프레임워크/저장소 무관, 테스트 대상)
   │  ├─ types.js                ← JSDoc @typedef: Player, Round, Pairing, Standing ...
   │  ├─ swissPairing.js         ← 스위스 페어링 엔진
   │  ├─ standings.js            ← 승점 + 버흘홀츠 + 정렬/순위
   │  ├─ bot.js                  ← 봇 배정 / 봇 레이팅(effectiveRating) 계산
   │  ├─ knockout.js             ← 시드·브래킷·미니매치·아마게돈
   │  └─ rules.js                ← 승점/결석/실격 상수 & 규칙
   │
   ├─ data/                      ★ 저장 이음새
   │  ├─ store.js                ← Store 계약(JSDoc) + 팩토리
   │  ├─ localStore.js           ← localStorage 어댑터 (MVP 기본)
   │  ├─ firebaseStore.js        ← Firestore 어댑터 (2차)
   │  └─ firebase.js             ← Firebase 초기화
   │
   ├─ auth/
   │  └─ auth.js                 ← ID+PIN 로그인/세션, PIN 해시, 운영자 판별
   │
   ├─ services/
   │  └─ chesscom.js             ← Chess.com API 클라이언트 + 게임 대조 검증
   │
   ├─ state/
   │  └─ AppContext.jsx          ← 전역 상태 (현재 phase/round, 로그인 사용자, 캐시)
   │
   ├─ pages/
   │  ├─ RegisterPage.jsx        ← 참가자 자기 등록 (이름·유저네임·실력·ID·PIN)
   │  ├─ StandingsPage.jsx       ← 순위표 (진출선/탈락선)
   │  ├─ PairingsPage.jsx        ← 대진표 ("내 상대" 강조, 봇 표시)
   │  ├─ SubmitResultPage.jsx    ← Chess.com URL 결과 제출 (로그인 필요)
   │  ├─ AdminPanel.jsx          ← 운영자 패널
   │  └─ LoginPage.jsx           ← 로그인 (참가자 ID+PIN / 운영자)
   │
   ├─ components/                ← 공용 UI (StandingsTable, PairingCard, ...)
   ├─ hooks/                     ← useStore, useCurrentRound ...
   ├─ styles/                    ← 반응형 스타일 토큰
   └─ test/
      ├─ swissPairing.test.js
      ├─ standings.test.js
      └─ knockout.test.js
```

핵심 의도: **`domain/`이 앱의 심장**이고, 저장소·UI는 그 둘레를 감싸는 껍질. 저장소를 바꿔도 심장은 그대로.

---

## 4. 데이터 모델 (Firestore 스키마)

> 표기는 TypeScript 인터페이스(= 문서 스키마). 로컬 어댑터도 동일 구조를 JSON으로 보관.

### 4.1 컬렉션 한눈에

```
tournament/main                 (단일 설정/상태 문서)
players/{playerId}              (참가자)
rounds/{roundId}                (라운드)
  └─ pairings/{pairingId}       (해당 라운드의 대진 — 서브컬렉션)
standings/current               (★ 캐시된 순위 요약 — 라운드 마감 시 1회 갱신)
standings/{roundId}             (라운드별 순위 스냅샷, 선택)
matches/{matchId}               (녹아웃 미니매치 — 3차)
reviewQueue/{itemId}            (검증 실패/수동 확인 대기 — 2차)
```

### 4.2 `tournament/main` — 대회 전역 상태

```ts
interface Tournament {
  phase: 'registration' | 'swiss' | 'knockout' | 'finished';
  currentDay: number;            // 1..8
  currentRoundId: string | null; // 진행 중 라운드
  registrationOpen: boolean;
  rosterConfirmed: boolean;      // 운영자 명단 확정 여부
  config: {
    totalPlayers: number;        // 23
    swissRounds: number;         // 16
    advanceCount: number;        // 16 (녹아웃 진출 인원)
    botDay1Rating: number;       // 1000
    absenceLimitForDQ: number;   // 3
    points: { win: 1; draw: 0.5; loss: 0 };
  };
  updatedAt: Timestamp;
}
```

### 4.3 `players/{playerId}` — 참가자

```ts
interface Player {
  id: string;
  loginId: string;               // 로그인 ID (참가자 자기 지정, 중복 불가)
  loginIdKey: string;            // 소문자 정규화 (로그인 대조용)
  pinHash: string;               // 숫자 비번(PIN) 해시 — 평문 저장 X
  name: string;                  // 이름/닉네임
  chessUsername: string;         // Chess.com 유저네임 (원본)
  chessUsernameKey: string;      // 소문자 정규화 (대조용)
  skill: 'A' | 'B' | 'C';        // 자기신고 실력
  rating?: number | null;        // Chess.com 레이팅 (초심자 多 → 없을 수 있음)
  ratingSource?: 'chesscom' | 'none';
  uid?: string;                  // (선택) Firebase Auth 세션 연결
  status: 'registered' | 'confirmed' | 'disqualified';
  absenceCount: number;          // 결석 누적 (3 이상 → 실격)
  registeredAt: Timestamp;
}
```

> **정규화 키**: `chessUsernameKey = chessUsername.trim().toLowerCase()`, `loginIdKey` 동일 방식 — 등록 중복 방지 + 로그인/API 대조에 사용.
>
> **PIN 저장**: 숫자 비번은 평문으로 두지 않고 `pinHash`(해시)만 저장. 캐주얼 대회 수준의 경량 인증.
>
> **effectiveRating**: 초심자라 `rating`이 없는 경우가 많음 → 집계 시 `effectiveRating = rating ?? skillApprox(skill)`(예: A≈1100, B≈900, C≈700)로 보완. **봇 평균·1R 시드**에 이 값을 사용.

### 4.4 `rounds/{roundId}` — 라운드

```ts
interface Round {
  id: string;
  phase: 'swiss' | 'knockout';
  day: number;                   // 1..8
  index: number;                 // 전체 라운드 순번 (스위스 1..16)
  stage?: '16강'|'8강'|'4강'|'결승'; // 녹아웃만
  status: 'pending' | 'active' | 'closed';
  timeFormat: string;            // "5+0 블리츠", "10+0 래피드", "15+10" ...
  botRating: number;             // 이 라운드 봇 레이팅
  createdAt: Timestamp;
  closedAt?: Timestamp;
}
```

### 4.5 `rounds/{roundId}/pairings/{pairingId}` — 대진 (스위스)

```ts
type PairingResult =
  | 'pending'
  | 'white_win' | 'black_win' | 'draw'
  | 'bye_planned'    // 사전 신고 결석 → 0.5
  | 'bye_absent';    // 무단 결석 → 0 (상대 부전승)

interface Pairing {
  id: string;
  roundId: string;
  board: number;                 // 보드 번호
  whitePlayerId: string;
  blackPlayerId: string | 'BOT'; // 봇 배정 시 'BOT'
  isBotGame: boolean;
  result: PairingResult;
  // 검증
  gameUrl?: string;              // 참가자가 제출한 Chess.com URL
  resultSource: 'manual' | 'api' | 'admin';
  verified: boolean;             // API 대조 성공 여부
  flagged: boolean;              // 운영자 확인 필요
  submittedBy?: string;          // 제출자 playerId/uid
  submittedAt?: Timestamp;
}
```

> **승점 환산은 저장하지 않고 계산**: `result`만 저장하고, 순위 집계 시 `domain/standings.ts`가 승점으로 환산. 진실의 원천(source of truth)을 하나로.

### 4.6 `standings/current` — ★ 캐시된 순위 요약

라운드 마감 시 **단 1회** 재계산하여 통째로 덮어쓰는 요약 문서. 순위표 화면은 이 문서 **1건만** 읽음 (전체 컬렉션 스캔 X).

```ts
interface StandingsDoc {
  asOfRoundIndex: number;        // 몇 라운드까지 반영됐는지
  rows: StandingRow[];
  updatedAt: Timestamp;
}

interface StandingRow {
  playerId: string;
  name: string;
  chessUsername: string;
  points: number;                // 누적 승점
  buchholz: number;              // 상대 승점 합
  absences: number;
  rank: number;
  qualified: boolean;            // 16강 진출선 안쪽?
  disqualified: boolean;
}
```

### 4.7 `matches/{matchId}` — 녹아웃 미니매치 (3차)

```ts
interface KnockoutMatch {
  id: string;
  roundId: string;               // 16강/8강/4강/결승 라운드
  seedHigh: number;              // 상위 시드 순위 (1..)
  seedLow: number;
  playerHighId: string;
  playerLowId: string;
  games: {                       // 2판 미니매치
    gameNo: 1 | 2;
    whitePlayerId: string;       // 1판/2판 흑백 교대
    result: 'high_win'|'low_win'|'draw'|'pending';
    gameUrl?: string;
  }[];
  armageddon?: {                 // 1:1 동점 시
    whitePlayerId: string;
    result: 'high_win'|'low_win'|'pending';
    gameUrl?: string;
  };
  winnerId?: string;
  status: 'pending' | 'active' | 'decided';
}
```

### 4.8 `reviewQueue/{itemId}` — 검증 대기 (2차)

```ts
interface ReviewItem {
  id: string;
  pairingId: string;
  reason: 'username_mismatch' | 'api_error' | 'url_invalid' | 'duplicate';
  gameUrl: string;
  rawApiData?: unknown;
  createdAt: Timestamp;
  resolved: boolean;
}
```

---

## 5. 도메인 로직 모듈

### 5.1 `rules.ts` — 상수 & 규칙

```ts
export const POINTS = { win: 1, draw: 0.5, loss: 0 } as const;
export const ABSENCE = { plannedBye: 0.5, unexcused: 0, dqThreshold: 3 } as const;
export const BOT_DAY1_RATING = 1000;
export const SWISS_ROUNDS = 16;
export const ADVANCE_COUNT = 16;
```

### 5.2 `swissPairing.ts` — 스위스 페어링 엔진

입력: 참가자 목록(+점수/상대이력/색 이력), 라운드 번호 → 출력: `Pairing[]`

**알고리즘 개요**
1. **1라운드**: `effectiveRating`(레이팅 있으면 그 값, 없으면 A/B/C 근사) 내림차순으로 시드 풀 구성 → 상·하위 교차 매칭으로 극단 대진 완화. 동급 구간 안에서만 랜덤.
2. **2라운드 이후**:
   - 참가자를 **승점 내림차순**(동점은 버흘홀츠) 정렬.
   - 같은 승점끼리 **스코어 브래킷(풀)** 으로 묶음.
   - 풀 안에서 상위절반 vs 하위절반 매칭.
   - **재매칭 회피**: 이미 만난 상대면 다음 후보로 스왑 (백트래킹).
   - **흑백 균형**: 각자 누적 색 차이(`whiteCount - blackCount`)가 0에 가깝도록 색 배정. 직전 색과 반대 우선.
   - 풀에 홀수가 남으면 한 명을 아래 풀로 **플로팅**.
3. **봇 배정 (23명 홀수 보정)**: 전체가 홀수라 매칭 안 되는 1명에게 `'BOT'` 배정.
   - 후보 선정: 아직 봇과 안 붙은 사람 우선 → 그중 하위 승점 우선 (균형). "봇 중복 배정 최소화" 규칙.

```ts
function generateSwissPairings(input: {
  players: PlayerStanding[];     // 점수/상대이력/색이력 포함
  roundIndex: number;
  seedBySkill?: boolean;
}): Pairing[];
```

> 정식 더치 스위스(FIDE)의 전체 구현은 과하므로, **실무적으로 충분한** 그리디+백트래킹 버전으로 시작하고 테스트로 품질 고정. 필요 시 고도화.

### 5.3 `standings.ts` — 순위 집계

```ts
function computeStandings(
  players: Player[],
  allPairings: Pairing[]
): StandingRow[];
```

- 각 참가자 **누적 승점** 계산 (`result` → 승/무/패 환산, 봇전·부전승 포함).
- **버흘홀츠** = 상대들의 누적 승점 합.
  - 봇 상대 처리: `'BOT'`을 **가상 플레이어**로 취급해 봇의 누적 승점을 함께 집계 → 버흘홀츠에 반영. (관례 통일)
- **정렬 키 순서**: ① 승점 ↓ ② 버흘홀츠 ↓ ③ 결석 횟수 ↑.
- 실격자(`disqualified` 또는 결석≥3)는 순위표 하단으로 분리 표기.
- `rank` 부여 + `qualified = rank <= 16`.

### 5.4 `bot.ts` — 봇 배정 & 레이팅

```ts
function botRatingForRound(round, players); // → number
// day===1 → 1000 고정
// day>=2  → 직전 라운드 시점 참가자 effectiveRating 평균
//           (Chess.com 레이팅 있으면 사용, 없으면 skill 근사치로 보완)
```

- 레이팅 출처: 2차에서 Chess.com API로 각 참가자 레이팅 수집 → `rating` 채움.
- **초심자라 레이팅 없는 참가자가 다수** → `effectiveRating = rating ?? skillApprox(skill)`로 항상 평균 계산 가능.
- 운영자 수동 조정도 허용(예외 상황 대비).

### 5.5 `knockout.ts` — 브래킷 (3차)

- **시드**: 스위스 최종 순위로 `1 vs 16, 2 vs 15 …`.
- **미니매치**: 2판(백/흑 교대). 2:0 → 즉시 승자. 1:1 → 아마게돈 1판.
- 아마게돈 타임포맷: 일반 라운드 5분 블리츠 / 결승 10분 래피드.
- 라운드 진행: 16강→8강→4강→결승, 각 일차 매핑.

---

## 6. 화면 / 라우트 설계

| 라우트 | 화면 | 권한 | 핵심 동작 |
|--------|------|------|-----------|
| `/register` | 등록 페이지 | 공개 | 이름·Chess.com 유저네임(필수)·실력(A/B/C) 입력. 유저네임 중복/형식 체크. |
| `/` 또는 `/standings` | 순위표 | 공개 | `standings/current` 1건 읽어 렌더. 진출선(16위)·탈락선·실격 강조. 반응형. |
| `/pairings` | 대진표 | 공개 | 현재 라운드 대진. "내 상대" 강조, 봇 매칭 배지, 타임포맷 표시. |
| `/submit` | 결과 제출 | 참가자 | Chess.com 게임 URL 입력 → (2차)자동 검증 → 결과 반영. MVP는 승/무/패 수동 선택. |
| `/admin` | 운영자 패널 | 운영자 | 명단 확정, 라운드 시작/마감, 페어링 생성, 결석/실격, 봇 레이팅, 검증 실패 승인. |
| `/login` | 로그인 | 공개 | 운영자 Firebase Auth 로그인. |

UI 톤: 깔끔·직관(초심자 친화), 모바일 우선 반응형, 진출/탈락선이 한눈에.

---

## 7. 권한 & 보안 규칙

- **Firebase Authentication**으로 역할 분리.
  - 운영자: 지정 계정(커스텀 클레임 `admin:true` 또는 `admins/{uid}` 화이트리스트)으로 로그인.
  - 참가자: **자기 지정 로그인 ID + 숫자 비번(PIN)** 으로 로그인 (등록 시 함께 설정). PIN은 해시(`pinHash`)로만 저장.
    - 2차(Firebase): 짧은 숫자 PIN은 Firebase Auth에 직접 못 태우므로 → 익명 Auth 세션 + `loginId↔uid` 매핑(또는 앱레벨 세션)으로 처리. 결과 쓰기는 어차피 검증 게이트를 거치므로 참가자 인증 강도는 낮아도 안전.
- **Firestore 보안 규칙(요지)**:
  - `players`: 등록은 누구나 생성 가능(형식 검증), 수정/삭제는 운영자만.
  - `rounds`, `pairings`: 읽기는 공개, 쓰기는 운영자만. 단, 결과 제출은 **본인 대진의 `gameUrl`/제출 필드**에 한해 참가자 허용(검증 전 `pending`).
  - `standings`: 읽기 공개, 쓰기 운영자/서버만.
- 핵심: **승점·순위는 클라이언트가 직접 못 쓴다.** 결과는 검증 통과 또는 운영자 승인으로만 확정.

---

## 8. Chess.com 결과 검증 흐름

```
참가자: Chess.com에서 경기 → 게임 URL 복사 → /submit 에 붙여넣기
   │
   ▼
앱: URL 파싱 → gameId/유저 추출
   │  (예: https://www.chess.com/game/live/XXXXXXXX)
   ▼
Chess.com Public API 조회
   - 플레이어 월별 아카이브: /pub/player/{user}/games/{YYYY}/{MM}
   - 해당 게임의 white/black 유저네임 + 결과 확인
   ▼
대조: 게임의 두 유저네임 == 대진의 두 참가자 chessUsernameKey ?
   ├─ 일치 & 결과 명확 → result 자동 반영, verified=true
   └─ 불일치 / 조회 실패 / URL 이상 → flagged=true, reviewQueue 적재 → 운영자 확인
```

- 결과 매핑: API의 승/무/패 + 색 → `white_win | black_win | draw`.
- 레이트리밋 대비: 호출 캐싱·재시도·에러시 수동 폴백.
- **MVP에서는 이 단계를 생략**하고 운영자/참가자 수동 입력 → 순위 반영. 검증은 2차.

---

## 9. Firestore 사용량 최적화 전략

스펙의 요구를 설계에 직접 반영:

| 요구 | 설계 반영 |
|------|-----------|
| onSnapshot 남발 금지 | 순위표/대진표는 **1회성 get**으로 로드. 진행 중 상시 구독 X. 필요 화면(운영자 진행 중)만 제한적 구독. |
| 순위 갱신 시점 제한 | 매 입력마다 재집계 X. **라운드 마감(운영자 액션) 시 1회** `computeStandings` → `standings/current` 덮어쓰기. |
| 집계 캐싱 | 순위·버흘홀츠는 전체 문서 재조회로 매번 계산하지 않고 **요약 문서 1건**만 읽음. |
| 클라이언트 캐시 | Firestore SDK 로컬 캐시(persistence) 활성화 → 동일 데이터 반복 조회 방지. |
| 읽기 단위 최소화 | 화면별 필요한 문서/쿼리만. 현재 라운드 `pairings` 등 좁은 쿼리. 전체 스캔 지양. |

읽기 비용 요약(평상시 1인 1회 화면 진입):
- 순위표 = `standings/current` **1 read**.
- 대진표 = 현재 라운드 `pairings` 소량 read.
- 등록/제출 = 본인 관련 소량.

---

## 10. 8일치 운영 타임라인 (상태 머신)

### 전체 phase 흐름

```
registration ──(운영자 명단 확정)──► swiss ──(16라운드 종료)──► knockout ──(결승)──► finished
```

### 라운드 1개의 생명주기 (스위스/녹아웃 공통)

```
[pending]
  └ 운영자 "라운드 시작" → 페어링 생성(generateSwissPairings) → [active]
[active]
  └ 참가자 경기 → 결과 제출/검증(또는 수동) → 대진 result 채워짐
  └ 운영자 "라운드 마감" → computeStandings → standings/current 갱신 → [closed]
[closed]
  └ 다음 라운드 [pending] 생성
```

### 일자별 매핑

| 일차 | 단계 | 라운드 | 타임포맷 | 형식 |
|------|------|--------|----------|------|
| 등록기간 | 등록 | — | — | 자기등록 → 명단 확정 |
| 1일차 | 스위스 | R1~R4 | 5+0 블리츠 | 1R 랜덤(시드 보정), 봇 1000 |
| 2일차 | 스위스 | R5~R8 | 5+0 블리츠 | 봇=직전 평균레이팅 |
| 3일차 | 스위스 | R9~R12 | 5+0 블리츠 | 〃 |
| 4일차 | 스위스 | R13~R16 | 5+0 블리츠 | 종료 후 **상위 16명 진출** |
| 5일차 | 녹아웃 | 16강 | 10+0 래피드 | 2판+아마게돈(5분) |
| 6일차 | 녹아웃 | 8강 | 10+0 래피드 | 2판+아마게돈(5분) |
| 7일차 | 녹아웃 | 4강 | 10+0 래피드 | 2판+아마게돈(5분) |
| 8일차 | 녹아웃 | 결승 | 15+10 | 2판+아마게돈(10분 래피드) |

### 결석/실격 처리 (각 라운드 마감 시 반영)

- 사전 신고 결석 → 해당 대진 `bye_planned` → 0.5점, `absenceCount++`.
- 무단 결석 → `bye_absent` → 0점, `absenceCount++`.
- `absenceCount >= 3` → `status='disqualified'` → 순위표 분리/제외, 동점 정렬에 결석 반영.

---

## 11. 데이터 저장 이음새 (Storage Adapter)

UI/도메인은 **`Store` 인터페이스**만 의존. 구현은 런타임에 선택.

```ts
interface Store {
  // tournament
  getTournament(): Promise<Tournament>;
  updateTournament(patch: Partial<Tournament>): Promise<void>;
  // players
  listPlayers(): Promise<Player[]>;
  addPlayer(p: NewPlayer): Promise<Player>;
  updatePlayer(id: string, patch: Partial<Player>): Promise<void>;
  // rounds & pairings
  getRound(id: string): Promise<Round>;
  listPairings(roundId: string): Promise<Pairing[]>;
  savePairings(roundId: string, pairings: Pairing[]): Promise<void>;
  setPairingResult(id: string, r: PairingResultUpdate): Promise<void>;
  // standings (cache)
  getStandings(): Promise<StandingsDoc>;
  saveStandings(doc: StandingsDoc): Promise<void>;
}
```

- `localStore.ts` — `localStorage` 기반. **MVP 기본**. 설정·키 없이 즉시 실행/검증 가능.
- `firebaseStore.ts` — Firestore 기반. **2차**. 같은 인터페이스 구현.
- 전환은 환경변수/플래그 한 줄(`VITE_STORE=local|firebase`)로.

이 덕분에: **페어링/순위 로직과 화면을 지금 완성**하고, Firebase는 키가 준비되면 어댑터만 끼우면 됨.

---

## 12. 로드맵 (MVP → 2차 → 3차)

### 1차 — MVP (등록 → 페어링 → 수동입력 → 순위표)
- [ ] Vite + React(+TS) 스캐폴드, 라우팅, 반응형 셸
- [ ] `domain/` 핵심: `rules`, `swissPairing`, `standings`, `bot`(기본) + **단위 테스트**
- [ ] `localStore` 어댑터 + 시드 데이터(23명 더미)
- [ ] 화면: 등록 / 순위표 / 대진표 / 결과(수동 승·무·패) / 운영자 기본(라운드 시작·마감)
- [ ] 봇 홀수 보정 1명 배정, 라운드 마감 시 순위 캐시 갱신
- ➡ 산출물: **브라우저에서 23명 대회를 끝까지 굴려보는** 데모

### 2차 — Chess.com 검증 + Firebase
- [ ] `chesscom.ts` URL 파싱 + 아카이브 조회 + 유저네임 대조
- [ ] `firebaseStore` 어댑터, Firebase Auth(운영자/참가자)
- [ ] `firestore.rules` 보안 규칙, `reviewQueue` 운영자 승인 UI
- [ ] 봇 레이팅 자동(참가자 평균 from API)

### 3차 — 녹아웃 + 자동화 + 배포
- [ ] `knockout.ts` + 브래킷 UI(미니매치/아마게돈)
- [ ] 결석/실격 자동화, 동점 정렬 고도화
- [ ] GitHub Pages 빌드/배포 파이프라인(+ 필요 시 Firebase Hosting)

---

## 13. 확정된 결정 (Decisions)

> 사용자 확인 완료 (2026-06-15).

1. **언어 = JavaScript** (+ JSDoc 타입 주석, Vitest). TS 빌드 없이 단순·검증 수월. 본 문서의 인터페이스 표기는 스키마 설명용.
2. **참가자 로그인 = 자기 지정 ID + 숫자 PIN.** 등록 시 ID/PIN 설정 → 로그인 후 "내 대진"·결과 제출. PIN은 해시 저장. ([7장](#7-권한--보안-규칙))
3. **레이팅 반영 = O (단, 초심자라 없는 사람이 多).** Chess.com에서 가능하면 가져오되, 없으면 `skill(A/B/C)→근사치`로 보완한 **effectiveRating** 사용. 봇 평균·시드에 반영.
4. **배포 = GitHub Pages + Firebase Hosting 병행.**
5. **1라운드 시드 = A/B/C 가중 + 레이팅 반영.** `effectiveRating` 내림차순으로 시드 풀을 만들어 극단 매칭 완화(완전 랜덤 아님).

### 아직 살짝 열린 디테일 (진행하며 정함)
- Chess.com 레이팅을 블리츠/래피드 중 무엇을 우선으로 가져올지 (예선=블리츠 기준이 자연스러움).
- 운영자 계정 개수 / 초기 운영자 지정 방식.

---

*이 설계가 합의되면 → 1차(MVP) 폴더 스캐폴드 + `domain/` 로직 + 로컬 데모부터 착수.*
```