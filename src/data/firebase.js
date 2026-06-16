// Firebase 초기화 (2차). 키가 없으면 절대 import 단계에서 터지지 않도록 지연 초기화.
// .env 의 VITE_FIREBASE_* 값을 사용. VITE_STORE=firebase 일 때만 실제로 호출됨.

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';

function readConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

let cache = null;

export function getFirebase() {
  if (cache) return cache;
  const config = readConfig();
  if (!config.apiKey || !config.projectId) {
    throw new Error('Firebase 설정이 없어요. .env 에 VITE_FIREBASE_* 값을 채워 주세요.');
  }
  const app = getApps()[0] || initializeApp(config);
  cache = { app, db: getFirestore(app), auth: getAuth(app) };
  return cache;
}

let authPromise = null;

// 익명 로그인 시도 — 단, 실패해도 절대 막지 않음(비치명적).
// 테스트 모드 Firestore 는 인증 없이도 동작하므로, 익명 로그인을 아직 안 켰어도 앱은 굴러감.
// 익명 로그인을 켜두면 자동으로 request.auth 가 붙어 강화 규칙도 통과.
export function ensureAuth() {
  let auth;
  try {
    auth = getFirebase().auth;
  } catch {
    return Promise.resolve(null);
  }
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!authPromise) {
    authPromise = signInAnonymously(auth)
      .then((c) => c.user)
      .catch((e) => {
        console.warn(
          '익명 로그인 미적용(테스트 모드면 무시 가능). Authentication→익명을 켜면 인증이 붙어요:',
          e.code || e.message,
        );
        return null;
      });
  }
  return authPromise;
}

// 운영자 구글 로그인 (팝업).
export async function signInWithGoogle() {
  const { auth } = getFirebase();
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

// 운영자 허용 이메일 목록 (.env VITE_ADMIN_EMAILS, 콤마 구분). 비어 있으면 누구나 구글 로그인=운영자.
export function adminEmails() {
  const raw = import.meta.env.VITE_ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
