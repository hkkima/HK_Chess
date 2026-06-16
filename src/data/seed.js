// 데모용 더미 참가자 23명 (운영자 패널에서 한 번에 채우기).
// 일부는 rating 보유, 다수는 null → effectiveRating 동작 확인.
// 데모 PIN은 모두 '1234'.

import { hashPin, normalizeId } from '../auth/auth.js';

const RAW = [
  ['나비', 'navi_cat', 'A', 1240],
  ['초코', 'choco_knight', 'A', 1180],
  ['달이', 'moon_dali', 'A', null],
  ['보리', 'bori_pawn', 'B', 980],
  ['구름', 'cloud_rook', 'B', null],
  ['단풍', 'maple_bishop', 'B', 1020],
  ['하늘', 'sky_queen', 'B', null],
  ['바다', 'sea_king', 'C', 760],
  ['별이', 'star_byeol', 'C', null],
  ['솜이', 'somi_soft', 'C', null],
  ['모카', 'mocha_move', 'A', 1300],
  ['라떼', 'latte_late', 'B', 940],
  ['콩이', 'kong_castle', 'C', null],
  ['뭉치', 'mungchi', 'B', null],
  ['까미', 'kkami_black', 'A', 1150],
  ['치즈', 'cheese_check', 'C', 700],
  ['앵두', 'cherry_endgame', 'B', null],
  ['포도', 'grape_gambit', 'C', null],
  ['감자', 'potato_passed', 'B', 1000],
  ['고구마', 'sweetpotato', 'C', null],
  ['두부', 'tofu_tempo', 'A', 1210],
  ['미소', 'miso_mate', 'B', null],
  ['햇살', 'sunny_skewer', 'C', 820],
];

export function makeDemoPlayers() {
  const now = Date.now();
  return RAW.map(([name, username, skill, rating], i) => ({
    id: `demo_${i}_${username}`,
    loginId: username,
    loginIdKey: normalizeId(username),
    pinHash: hashPin('1234'),
    name,
    chessUsername: username,
    chessUsernameKey: normalizeId(username),
    skill,
    rating,
    ratingSource: rating != null ? 'chesscom' : 'none',
    status: 'registered',
    absenceCount: 0,
    registeredAt: now + i,
  }));
}
