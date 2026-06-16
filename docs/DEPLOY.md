# 배포 가이드 (DEPLOY.md)

정적 빌드라 **Firebase Hosting**(추천) 또는 **GitHub Pages**, 둘 다 가능. 데이터는 Firestore에 있으므로 어디에 올리든 동일하게 동작.

> 빌드 전 `.env`에 Firebase 키와 `VITE_STORE=firebase`가 채워져 있어야 함(이미 설정됨).

---

## A. Firebase Hosting (추천 — 가장 간단)

Firestore/Auth와 같은 도메인이라 연동이 매끄럽다.

```bash
# 1) Firebase CLI 설치 (최초 1회)
npm i -g firebase-tools

# 2) 로그인 + 프로젝트 지정
firebase login
firebase use hk-chess-tournament

# 3) 빌드 + 배포 (Hosting + Firestore 규칙 함께)
npm run build
firebase deploy --only hosting,firestore:rules
```

- 배포 후 `https://hk-chess-tournament.web.app` 형태의 URL이 나온다.
- `firebase.json`에 hosting(`dist`) + SPA rewrite + firestore 규칙이 이미 설정돼 있음.
- **규칙 배포 시 주의**: `firestore.rules`는 "쓰기=로그인 필요"라, Authentication에서 **익명** 또는 **구글** 로그인이 켜져 있어야 참가자/운영자 쓰기가 통과한다. (테스트 모드 졸업 시 필수)

---

## B. GitHub Pages

`base` 경로가 `/chess-tournament/`로 바뀌는 `build:ghpages` 스크립트 사용.

### B-1. 수동 배포 (gh-pages 패키지)

```bash
npm i -D gh-pages
npm run build:ghpages
npx gh-pages -d dist
```

### B-2. 자동 배포 (GitHub Actions)

리포지토리 **루트**에 `.github/workflows/deploy.yml`로 아래를 저장. Firebase 키는 리포 **Settings → Secrets → Actions**에 `VITE_FIREBASE_*`로 등록.

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: chess-tournament   # 앱 폴더 (리포 구조에 맞게 조정)
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build:ghpages
        env:
          VITE_STORE: firebase
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
          VITE_ADMIN_EMAILS: ${{ secrets.VITE_ADMIN_EMAILS }}
      - uses: actions/upload-pages-artifact@v3
        with: { path: chess-tournament/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

> Settings → Pages → Source를 **GitHub Actions**로 설정.

### Firebase 승인 도메인
GitHub Pages 도메인(`<user>.github.io`)에서 구글 로그인을 쓰려면, Firebase 콘솔 → Authentication → Settings → **승인된 도메인**에 그 도메인을 추가해야 한다. (web.app/firebaseapp.com은 기본 포함)

---

## 운영 전 체크리스트

- [ ] Authentication → **익명** 또는 **구글** 로그인 활성화
- [ ] `firestore.rules` 배포 (테스트 모드 만료 전 강화)
- [ ] 운영자 한정 시 `.env`의 `VITE_ADMIN_EMAILS`에 운영자 이메일
- [ ] 운영자 패널 **전체 초기화**로 데모 데이터 비우기
- [ ] 실제 참가자 등록 → 명단 확정 → 1일차 시작
