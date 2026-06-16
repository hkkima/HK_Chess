// 참가자 ID + 숫자 PIN 로그인 (DESIGN 결정 #2)
// PIN은 평문 저장하지 않고 해시만 보관.
// ⚠️ MVP용 경량 해시(djb2). 2차(Firebase)에서 실제 해시/Auth로 교체.

export function normalizeId(id) {
  return String(id || '').trim().toLowerCase();
}

export function hashPin(pin) {
  const s = String(pin);
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return 'pin_' + (h >>> 0).toString(16);
}

export function verifyPin(pin, hash) {
  return hashPin(pin) === hash;
}

// MVP 운영자 비밀번호 (클라이언트 상수 — 2차에서 Firebase Auth로 대체)
export const ADMIN_PASSWORD = 'cat1234';
