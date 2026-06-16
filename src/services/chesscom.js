// Chess.com Public API 결과 검증 (DESIGN 8장)
//
// 흐름: 게임 URL → 게임 ID 파싱 → 참가자 월별 아카이브에서 해당 게임 조회
//      → 양쪽 유저네임이 등록 정보와 일치하는지 대조 → 결과(승/무/패) 판정.
// CORS·User-Agent 차단 없이 브라우저에서 직접 호출 가능함을 확인함(프록시 불필요).
//
// 순수 헬퍼(parseGameId / gameOutcome / packGame)는 네트워크 없이 단위 테스트.
// verifyGameUrl 만 실제 API를 호출한다.

const API_BASE = 'https://api.chess.com/pub';

/** 다양한 형태의 Chess.com 게임 URL에서 숫자 게임 ID 추출 */
export function parseGameId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:live\/game|game\/live|game\/daily|game)\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * 게임의 승자 색 판정.
 * Chess.com result 코드: 이긴 쪽은 'win', 진 쪽은 resigned/checkmated/timeout/abandoned 등,
 * 무승부는 양쪽 모두 agreed/repetition/stalemate/insufficient/50move/timevsinsufficient.
 * @returns {'white'|'black'|'draw'}
 */
export function gameOutcome(game) {
  if (game?.white?.result === 'win') return 'white';
  if (game?.black?.result === 'win') return 'black';
  return 'draw';
}

/** API 게임 객체 → 검증에 필요한 핵심만 추림 (유저네임은 소문자 정규화) */
export function packGame(game) {
  return {
    gameId: parseGameId(game.url),
    url: game.url,
    whiteUsername: String(game.white?.username || '').toLowerCase(),
    blackUsername: String(game.black?.username || '').toLowerCase(),
    winner: gameOutcome(game),
    timeClass: game.time_class,
    timeControl: game.time_control,
    endTime: game.end_time,
    pgn: game.pgn || null, // 기보(수순) 원문
  };
}

/**
 * PGN 원문 → SAN 수순 배열. (헤더/시계주석/결과토큰/수번호 제거)
 * @param {string} pgn
 * @returns {string[]} 예: ['e4','e5','Nf3','Nc6', ...]
 */
export function parsePgnMoves(pgn) {
  if (!pgn) return [];
  const body = String(pgn)
    .split('\n')
    .filter((line) => !line.trim().startsWith('['))
    .join(' ');
  const text = body
    .replace(/\{[^}]*\}/g, ' ') // {[%clk ...]} 같은 주석 제거
    .replace(/\$\d+/g, ' ') // NAG 제거
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ' ') // 결과 토큰 제거
    .replace(/\d+\.(\.\.)?/g, ' '); // 수번호(12. / 12...) 제거
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Chess.com 유저네임 실존 확인 (등록 시 오타 방지 / "땡겨올 수 있게").
 * 404 → 없음(false). 네트워크 오류 등은 막지 않음(true).
 * @param {string} username
 * @returns {Promise<boolean>}
 */
export async function playerExists(username) {
  if (!username) return false;
  try {
    await fetchJson(`${API_BASE}/player/${encodeURIComponent(username)}`);
    return true;
  } catch (e) {
    if (e.status === 404) return false;
    return true;
  }
}

async function fetchJson(url, timeout = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** username 의 월별 아카이브를 최근부터 훑어 gameId 와 일치하는 게임 검색 */
async function findGameById(username, gameId, monthsBack = 3) {
  const list = await fetchJson(`${API_BASE}/player/${encodeURIComponent(username)}/games/archives`);
  const archives = Array.isArray(list.archives) ? list.archives : [];
  const recent = archives.slice(-monthsBack).reverse();
  for (const archiveUrl of recent) {
    let data;
    try {
      data = await fetchJson(archiveUrl);
    } catch {
      continue;
    }
    const games = Array.isArray(data.games) ? data.games : [];
    const hit = games.find((g) => parseGameId(g.url) === gameId);
    if (hit) return hit;
  }
  return null;
}

/**
 * 게임 URL을 검증한다.
 * @param {string} url 제출된 Chess.com 게임 URL
 * @param {string[]} expectedUsernames 대진 양쪽 참가자의 Chess.com 유저네임
 * @returns {Promise<{status:string, game?:object, detail:string}>}
 *   status: 'verified' | 'username_mismatch' | 'game_not_found' | 'invalid_url' | 'api_error'
 */
export async function verifyGameUrl(url, expectedUsernames) {
  const gameId = parseGameId(url);
  if (!gameId) {
    return { status: 'invalid_url', detail: 'URL에서 게임 ID를 찾지 못했어요. Chess.com 게임 주소가 맞는지 확인해 주세요.' };
  }

  let game = null;
  let lastError = null;
  for (const username of expectedUsernames) {
    if (!username) continue;
    try {
      game = await findGameById(username, gameId);
      if (game) break;
    } catch (e) {
      lastError = e;
    }
  }

  if (!game) {
    if (lastError) {
      return { status: 'api_error', detail: `Chess.com 조회 중 오류: ${lastError.message}` };
    }
    return { status: 'game_not_found', detail: '해당 게임을 참가자 아카이브에서 찾지 못했어요. (최근 3개월 내 경기인지 확인)' };
  }

  const packed = packGame(game);
  const got = new Set([packed.whiteUsername, packed.blackUsername]);
  const want = new Set(expectedUsernames.map((u) => String(u).toLowerCase()));
  const usernamesMatch = got.size === want.size && [...want].every((u) => got.has(u));

  if (!usernamesMatch) {
    return {
      status: 'username_mismatch',
      game: packed,
      detail: `게임 참가자(${packed.whiteUsername} vs ${packed.blackUsername})가 등록된 대진과 달라요.`,
    };
  }

  return { status: 'verified', game: packed, detail: '양쪽 유저네임 일치 — 결과 자동 반영.' };
}

/**
 * 참가자의 Chess.com 레이팅 조회 (봇 평균/시드용, DESIGN 결정 #3).
 * 초심자는 레이팅이 없는 경우가 많아 → 없으면 null 반환(호출부에서 effectiveRating로 보완).
 * 예선이 블리츠라 기본 블리츠 우선, 없으면 래피드/불릿.
 * @param {string} username
 * @param {'blitz'|'rapid'} [prefer]
 * @returns {Promise<number|null>}
 */
export async function fetchPlayerRating(username, prefer = 'blitz') {
  if (!username) return null;
  const stats = await fetchJson(`${API_BASE}/player/${encodeURIComponent(username)}/stats`);
  const order =
    prefer === 'rapid'
      ? ['chess_rapid', 'chess_blitz', 'chess_bullet']
      : ['chess_blitz', 'chess_rapid', 'chess_bullet'];
  for (const key of order) {
    const v = stats?.[key]?.last?.rating;
    if (typeof v === 'number') return v;
  }
  return null;
}
