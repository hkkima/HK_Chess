// 도메인 타입 정의 (JSDoc @typedef) — DESIGN 4장 스키마.
// JS라 런타임 강제는 없지만, 에디터 인텔리센스 + 문서 역할.

/**
 * @typedef {'A'|'B'|'C'} Skill
 * @typedef {'registered'|'confirmed'|'disqualified'} PlayerStatus
 */

/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} loginId        로그인 ID (자기 지정)
 * @property {string} loginIdKey     소문자 정규화
 * @property {string} pinHash        숫자 PIN 해시
 * @property {string} name
 * @property {string} chessUsername
 * @property {string} chessUsernameKey
 * @property {Skill} skill
 * @property {number|null} [rating]  Chess.com 레이팅 (없을 수 있음)
 * @property {'chesscom'|'none'} [ratingSource]
 * @property {PlayerStatus} status
 * @property {number} absenceCount
 * @property {number} registeredAt
 * @property {'in'|'out'} [koOverride]  운영자 16강 확정 진출('in')/탈락('out'). 없으면 자동 순위 기준.
 */

/**
 * @typedef {'pending'|'white_win'|'black_win'|'draw'} PairingResult
 */

/**
 * @typedef {Object} Pairing
 * @property {string} id
 * @property {string} roundId
 * @property {number} board
 * @property {string} whitePlayerId        플레이어 id 또는 'BOT'
 * @property {string} blackPlayerId        플레이어 id 또는 'BOT'
 * @property {boolean} isBotGame
 * @property {PairingResult} result
 * @property {string|null} [gameUrl]
 * @property {'manual'|'api'|'admin'|null} [resultSource]
 * @property {boolean} verified
 * @property {boolean} flagged
 */

/**
 * @typedef {Object} Round
 * @property {string} id
 * @property {'swiss'|'knockout'} phase
 * @property {number} day
 * @property {number} index            전체 라운드 순번 (스위스 1~16)
 * @property {'pending'|'active'|'closed'} status
 * @property {string} timeFormat
 * @property {number} botRating
 */

/**
 * @typedef {Object} StandingRow
 * @property {string} playerId
 * @property {string} name
 * @property {string} chessUsername
 * @property {number} points
 * @property {number} buchholz
 * @property {number} absences
 * @property {number|null} rank
 * @property {boolean} qualified
 * @property {boolean} disqualified
 * @property {'in'|'out'|null} [koOverride]
 */

export {};
