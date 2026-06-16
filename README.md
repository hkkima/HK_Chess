# ♟️ 체스 토너먼트 운영 웹앱

23명 규모 초심자 체스 대회를 위한 **스위스 예선 + 녹아웃 결선** 자동 운영 웹앱.
참가자 자기등록 · 자동 페어링 · 순위(버흘홀츠) 집계 · (예정) Chess.com URL 결과 검증.

> 설계 전문은 [`docs/DESIGN.md`](docs/DESIGN.md) 참고.

---

## 현재 상태 — 1차 MVP + 2차 검증 (로컬 동작) ✅

저장소는 **localStorage**(설정 없이 바로 실행). 2차 나머지(Firebase)에서 교체.

구현 완료 (1차):
- 참가자 자기등록 (이름 · Chess.com 유저네임 · 실력 A/B/C · 로그인 ID/PIN)
- **스위스 페어링 엔진** — 같은 승점 풀, 재매칭 회피, 흑백 균형, 23명 홀수 → 봇 1명 배정
- **순위 집계** — 승점 + 버흘홀츠(상대 승점 합) + 결석 정렬, 16강 진출선
- 라운드 생명주기 — 시작(페어링 생성) → 결과 입력 → 마감(순위 갱신)
- 봇 레이팅 — 1일차 1000, 2일차+ 참가자 effectiveRating 평균
- 화면 5종 — 순위표 / 대진표 / 등록 / 결과제출 / 운영자 패널 (+ 로그인)
- 반응형 (모바일 진출선 강조)
- 도메인 단위 테스트 (Vitest)

구현 완료 (2차 — Chess.com 결과 검증):
- **게임 URL 자동 검증** — `src/services/chesscom.js`: URL→게임ID 파싱 → 참가자 월별 아카이브 조회 → 양쪽 유저네임 대조 → 결과(승/무/패) 자동 판정. 색이 뒤바뀌어도 결과를 옳게 매핑.
- 참가자: 결과제출 화면에서 URL만 내면 자동 확정 (봇 게임은 수동).
- 운영자: **검증 대기열** — 불일치/조회실패 건을 직접 확인 후 결과 지정.
- 브라우저에서 CORS·User-Agent 차단 없이 직접 호출 확인(프록시 불필요). 실제 게임으로 E2E 검증 완료.

## 실행

```bash
npm install
npm run dev       # http://localhost:5180 (또는 5173)
npm test          # 도메인 로직 단위 테스트
npm run build     # Firebase Hosting / 로컬용 정적 빌드
npm run build:ghpages   # GitHub Pages용 (base=/chess-tournament/)
```

## 데모 빠르게 보기

1. 우측 상단 **로그인 → 운영자** (비밀번호 `cat1234`)
2. 운영자 패널 → **🐾 데모 23명 채우기** → **명단 확정** → **라운드 시작**
3. 결과 입력 후 **라운드 마감** → 순위표에서 집계 확인
4. 참가자 체험: 로그아웃 후 **로그인 → 참가자** (예: ID `navi_cat`, PIN `1234`) → 대진표에서 "내 대진" 강조

> ⚠️ MVP 비밀번호/PIN/해시는 데모용 경량 처리입니다. 2차(Firebase Auth)에서 교체됩니다.

## 로드맵

- **1차 ✅**: 등록 → 페어링 → 수동 결과 → 순위표 (로컬)
- **2차 ✅**: Chess.com 결과 자동 검증 ✅ / 봇 레이팅 API ✅ / Firebase(Firestore) 연동·실측 ✅ / 게임 기보(PGN) 표시 ✅ / 운영자 구글 로그인 ✅
- **3차 ✅**: 녹아웃 브래킷(시드·2판 미니매치·아마게돈·우승) ✅ / 결석·실격 자동화 ✅ / 배포 가이드([docs/DEPLOY.md](docs/DEPLOY.md)) ✅

### 녹아웃 결선 (3차)
- 스위스 최종 순위 상위 16 시드(1v16…) → 16강→8강→4강→결승. 인원이 적으면 작은 스테이지부터 시작.
- 2판 미니매치(흑백 교대) → 합산 우세 승. 1:1이면 **아마게돈** 1판. 결승까지 끝나면 우승 확정.
- [브래킷 페이지](src/pages/BracketPage.jsx): 운영자 결과 입력 / 참가자 URL 검증 / 누구나 기보 열람.

### 결석·실격 (3차)
- 운영자가 대진 결과에서 **불참(무단=0 / 사전=0.5)** 선택 시 결석 1회 누적, 상대 부전승.
- 누적 **3회**면 자동 실격 → 순위표에서 분리.

### 로그인 (2차)
- **참가자**: **Chess.com 유저네임 = 로그인 ID** + 가입 시 PIN. 등록 때 유저네임 실존을 API로 확인.
- **운영자**: 구글 로그인(firebase 모드) 또는 데모 비밀번호. 허용 계정은 `.env`의 `VITE_ADMIN_EMAILS`.

### 게임 기보 (2차)
- 결과 검증 시 Chess.com PGN을 함께 가져와 **수순(기보)** 을 결과제출·대진표에서 표시. PGN이 없으면 게임 링크로 폴백.

## Firebase 켜기 (선택)

기본은 localStorage 라 설정 없이 돌아가요. 여러 기기에서 공유하려면 Firebase 로 전환:

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 + 웹앱 추가 → `firebaseConfig` 6개 값 확보
2. **Firestore Database** 생성(테스트 모드) + **Authentication → 익명** 로그인 켜기
3. `.env.example` → `.env` 복사 후 값 채우고 `VITE_STORE=firebase` 로 변경
4. `npm run dev` → 이제 데이터가 Firestore 에 저장됨 (보안 규칙은 `firestore.rules`)

> 데이터 모델: `meta/tournament`, `meta/standings`, `players/`, `rounds/`, `pairings/`, `reviewQueue/`.
> 쓰기는 바뀐 문서만(diff sync) → 동시 제출 시 서로 덮어쓰지 않음.

## 구조

```
src/
  domain/    순수 로직 (rules, ratings, bot, swissPairing, standings) + test
  data/      localStore(저장 이음새) + seed(데모 23명)
  auth/      ID+PIN 로그인/PIN 해시
  state/     AppContext (전역 상태 + 액션)
  pages/     5개 화면 + 로그인
  components/ Nav, StandingsTable
```
