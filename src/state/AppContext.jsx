import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadDb, defaultDb } from '../data/localStore.js';
import { createStore } from '../data/store.js';
import { makeDemoPlayers } from '../data/seed.js';
import { normalizeId, hashPin, verifyPin, ADMIN_PASSWORD } from '../auth/auth.js';
import { generateSwissPairings } from '../domain/swissPairing.js';
import { computeStandings } from '../domain/standings.js';
import { botRatingForRound } from '../domain/bot.js';
import {
  seedEntrants,
  startingStageFor,
  createInitialMatches,
  createNextStageMatches,
  evaluateMatch,
  isStageComplete,
  newArmageddon,
  nextStage,
  KO_CONFIG,
} from '../domain/knockout.js';
import { verifyGameUrl, fetchPlayerRating, playerExists } from '../services/chesscom.js';
import { signInWithGoogle, adminEmails } from '../data/firebase.js';
import { dayOfRound, SWISS_ROUNDS, SWISS_TIME_FORMAT, ADVANCE_COUNT } from '../domain/rules.js';

const AppContext = createContext(null);

const SESSION_KEY = 'chess_tournament_session_v1';

// 현재 db 상태로 순위를 재계산해 standings 객체를 만든다(라운드 마감과 무관히 재사용).
function freshStandings(d) {
  const rows = computeStandings(
    d.players.filter((p) => p.status !== 'disqualified'),
    d.pairings,
  );
  return {
    asOfRoundIndex: d.tournament.currentRoundIndex,
    rows,
    updatedAt: Date.now(),
  };
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AppProvider({ children }) {
  const storeRef = useRef(null);
  if (!storeRef.current) storeRef.current = createStore();

  // 로컬은 즉시 캐시에서, 파베는 defaultDb 로 시작 후 loadAll 로 덮어씀.
  const [db, setDb] = useState(() =>
    storeRef.current.mode === 'local' ? loadDb() : defaultDb(),
  );
  const [user, setUser] = useState(() => loadSession());
  const [loading, setLoading] = useState(storeRef.current.mode !== 'local');

  // 저장소 로드. full=true 면 전체(운영자), false 면 현재 라운드/스테이지 범위만(공개·참가자).
  // 읽기량을 줄이려고 비관리자는 light 로 로드한다(파베 한정. 로컬은 항상 전체).
  function reload(full) {
    setLoading(true);
    return storeRef.current
      .loadAll({ full })
      .then((loaded) => setDb(loaded))
      .catch((e) => console.error('저장소 로드 실패:', e))
      .finally(() => setLoading(false));
  }

  // 마운트 시 1회 로드. 세션이 운영자면 full, 아니면 light.
  useEffect(() => {
    reload(loadSession()?.type === 'admin');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(SESSION_KEY);
  }, [user]);

  // 모든 변경은 update 를 통해 → 로컬 상태 갱신 + 저장소에 변경분 영속화
  function update(updater) {
    setDb((prev) => {
      const next = updater(structuredClone(prev));
      Promise.resolve(storeRef.current.sync(prev, next)).catch((e) =>
        console.error('저장소 동기화 실패:', e),
      );
      return next;
    });
  }

  const confirmedPlayers = useMemo(
    () => db.players.filter((p) => p.status !== 'disqualified'),
    [db.players],
  );

  const currentRound = useMemo(
    () => db.rounds.find((r) => r.id === db.tournament.currentRoundId) || null,
    [db.rounds, db.tournament.currentRoundId],
  );

  const currentPairings = useMemo(
    () => (currentRound ? db.pairings.filter((p) => p.roundId === currentRound.id) : []),
    [db.pairings, currentRound],
  );

  const currentMatches = useMemo(
    () =>
      db.tournament.knockoutStage
        ? db.matches.filter((m) => m.stage === db.tournament.knockoutStage)
        : [],
    [db.matches, db.tournament.knockoutStage],
  );

  // ---- 참가자 ----
  // 로그인 ID = Chess.com 유저네임 (그래야 닉네임으로 게임/레이팅을 땡겨올 수 있음).
  // 가입 시 PIN 설정 + 유저네임 실존 확인.
  async function registerPlayer({ name, chessUsername, skill, pin }) {
    if (!db.tournament.registrationOpen) throw new Error('등록이 마감되었어요.');
    const nm = String(name || '').trim();
    const cu = String(chessUsername || '').trim();
    const pn = String(pin || '').trim();
    if (!nm || !cu || !pn) throw new Error('모든 항목을 입력해 주세요.');
    if (!/^\d{4,8}$/.test(pn)) throw new Error('PIN은 숫자 4~8자리로 정해 주세요.');
    if (!['A', 'B', 'C'].includes(skill)) throw new Error('실력 단계를 선택해 주세요.');

    const cuKey = normalizeId(cu);
    if (db.players.some((p) => p.chessUsernameKey === cuKey))
      throw new Error('이미 등록된 Chess.com 유저네임이에요.');

    // 실존하는 Chess.com 유저인지 확인 (오타 방지 + 데이터 연동 보장)
    const exists = await playerExists(cu);
    if (!exists)
      throw new Error(`Chess.com에서 '${cu}' 유저를 찾지 못했어요. 철자를 확인해 주세요.`);

    const player = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      loginId: cu, // = Chess.com 유저네임
      loginIdKey: cuKey,
      pinHash: hashPin(pn),
      name: nm,
      chessUsername: cu,
      chessUsernameKey: cuKey,
      skill,
      rating: null,
      ratingSource: 'none',
      status: 'registered',
      absenceCount: 0,
      registeredAt: Date.now(),
    };
    update((d) => {
      d.players.push(player);
      return d;
    });
    return player;
  }

  // ---- 로그인 ----
  function loginPlayer(loginId, pin) {
    const key = normalizeId(loginId);
    const player = db.players.find((p) => p.loginIdKey === key);
    if (!player || !verifyPin(pin, player.pinHash))
      throw new Error('ID 또는 PIN이 올바르지 않아요.');
    setUser({ type: 'player', playerId: player.id, name: player.name });
    return player;
  }

  function loginAdmin(password) {
    if (password !== ADMIN_PASSWORD) throw new Error('운영자 비밀번호가 올바르지 않아요.');
    setUser({ type: 'admin', name: '운영자' });
    reload(true); // light 로 로드됐던 db 를 운영자용 전체로 교체
  }

  // 운영자 구글 로그인 (firebase 모드). VITE_ADMIN_EMAILS 화이트리스트가 있으면 그 계정만.
  async function loginAdminGoogle() {
    const u = await signInWithGoogle();
    const allow = adminEmails();
    const email = (u.email || '').toLowerCase();
    if (allow.length && !allow.includes(email)) {
      throw new Error(`이 계정(${u.email})은 운영자 목록에 없어요.`);
    }
    setUser({ type: 'admin', name: u.displayName || u.email || '운영자', email: u.email });
    reload(true); // light 로 로드됐던 db 를 운영자용 전체로 교체
  }

  function logout() {
    setUser(null);
  }

  // ---- 운영자: 명단 ----
  function loadDemoPlayers() {
    if (db.players.length > 0) throw new Error('이미 참가자가 있어요. 초기화 후 시도해 주세요.');
    update((d) => {
      d.players = makeDemoPlayers();
      return d;
    });
  }

  // Chess.com 레이팅 일괄 조회 → players.rating 갱신 (봇 평균·시드용, 2차/결정 #3)
  async function fetchRatings() {
    const targets = db.players;
    if (targets.length === 0) throw new Error('참가자가 없어요.');
    const results = await Promise.all(
      targets.map(async (p) => {
        try {
          const rating = await fetchPlayerRating(p.chessUsername);
          return { id: p.id, rating };
        } catch {
          return { id: p.id, rating: null };
        }
      }),
    );
    const map = new Map(results.map((r) => [r.id, r.rating]));
    update((d) => {
      d.players = d.players.map((p) => {
        const rating = map.get(p.id);
        return rating != null
          ? { ...p, rating, ratingSource: 'chesscom' }
          : { ...p, rating: null, ratingSource: 'none' };
      });
      return d;
    });
    return {
      total: targets.length,
      withRating: results.filter((r) => r.rating != null).length,
    };
  }

  function confirmRoster() {
    if (db.players.length < 2) throw new Error('참가자가 2명 이상이어야 해요.');
    update((d) => {
      d.players = d.players.map((p) =>
        p.status === 'registered' ? { ...p, status: 'confirmed' } : p,
      );
      d.tournament.rosterConfirmed = true;
      d.tournament.registrationOpen = false;
      return d;
    });
  }

  function reopenRegistration() {
    update((d) => {
      d.tournament.registrationOpen = true;
      d.tournament.rosterConfirmed = false;
      return d;
    });
  }

  // ---- 운영자: 라운드 제어 ----
  function startRound() {
    if (!db.tournament.rosterConfirmed) throw new Error('먼저 명단을 확정해 주세요.');
    if (currentRound && currentRound.status === 'active')
      throw new Error('진행 중인 라운드를 먼저 마감해 주세요.');
    const nextIndex = db.tournament.currentRoundIndex + 1;
    if (nextIndex > SWISS_ROUNDS) throw new Error('스위스 16라운드가 모두 끝났어요.');

    const players = db.players.filter((p) => p.status !== 'disqualified');
    const day = dayOfRound(nextIndex);
    const botRating = botRatingForRound(day, players);
    const roundId = `R${nextIndex}`;
    const pairings = generateSwissPairings({
      players,
      pastPairings: db.pairings,
      roundIndex: nextIndex,
      roundId,
    });
    const round = {
      id: roundId,
      phase: 'swiss',
      day,
      index: nextIndex,
      status: 'active',
      timeFormat: SWISS_TIME_FORMAT,
      botRating,
    };
    update((d) => {
      d.rounds.push(round);
      d.pairings = d.pairings.concat(pairings);
      d.tournament.phase = 'swiss';
      d.tournament.currentRoundIndex = nextIndex;
      d.tournament.currentRoundId = roundId;
      d.tournament.currentDay = day;
      return d;
    });
  }

  function setResult(pairingId, result, gameUrl = null) {
    update((d) => {
      d.pairings = d.pairings.map((p) =>
        p.id === pairingId
          ? { ...p, result, gameUrl, resultSource: 'manual' }
          : p,
      );
      return d;
    });
  }

  function closeRound() {
    if (!currentRound) throw new Error('진행 중인 라운드가 없어요.');
    update((d) => {
      d.rounds = d.rounds.map((r) =>
        r.id === d.tournament.currentRoundId ? { ...r, status: 'closed' } : r,
      );
      d.standings = freshStandings(d);
      if (d.tournament.currentRoundIndex >= SWISS_ROUNDS) {
        d.tournament.phase = 'finished';
      }
      return d;
    });
  }

  // ---- Chess.com 자동 검증 (2차) ----
  async function verifySubmission(pairingId, url) {
    const pairing = db.pairings.find((p) => p.id === pairingId);
    if (!pairing) throw new Error('대진을 찾을 수 없어요.');
    if (pairing.isBotGame) throw new Error('봇 게임은 자동 검증 대상이 아니에요. (수동 입력)');
    const gameUrl = String(url || pairing.gameUrl || '').trim();
    if (!gameUrl) throw new Error('게임 URL을 입력해 주세요.');

    const white = db.players.find((p) => p.id === pairing.whitePlayerId);
    const black = db.players.find((p) => p.id === pairing.blackPlayerId);
    if (!white || !black) throw new Error('대진 참가자 정보를 찾을 수 없어요.');

    const res = await verifyGameUrl(gameUrl, [white.chessUsername, black.chessUsername]);

    if (res.status === 'verified') {
      let result;
      if (res.game.winner === 'draw') {
        result = 'draw';
      } else {
        const winnerKey =
          res.game.winner === 'white' ? res.game.whiteUsername : res.game.blackUsername;
        result = winnerKey === white.chessUsernameKey ? 'white_win' : 'black_win';
      }
      update((d) => {
        d.pairings = d.pairings.map((p) =>
          p.id === pairingId
            ? {
                ...p,
                gameUrl,
                result,
                pgn: res.game.pgn || null,
                verified: true,
                flagged: false,
                resultSource: 'api',
              }
            : p,
        );
        return d;
      });
      return { ok: true, result, game: res.game };
    }

    // 실패 → 플래그 + 검증 대기열 적재 (결과는 건드리지 않음)
    update((d) => {
      d.pairings = d.pairings.map((p) =>
        p.id === pairingId ? { ...p, gameUrl, flagged: true } : p,
      );
      d.reviewQueue = (d.reviewQueue || []).concat([
        {
          id: `rq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          pairingId,
          reason: res.status,
          gameUrl,
          detail: res.detail || '',
          createdAt: Date.now(),
          resolved: false,
        },
      ]);
      return d;
    });
    return { ok: false, status: res.status, detail: res.detail };
  }

  // 운영자: 검증 대기 건 수동 해결
  function resolveReview(itemId, result) {
    update((d) => {
      const item = (d.reviewQueue || []).find((x) => x.id === itemId);
      if (!item) return d;
      item.resolved = true;
      if (result) {
        d.pairings = d.pairings.map((p) =>
          p.id === item.pairingId
            ? { ...p, result, resultSource: 'admin', flagged: false, verified: false }
            : p,
        );
      }
      return d;
    });
  }

  // ---- 결석/실격 (3차) ----
  // side: 'white'|'black', type: 'planned'(0.5)|'unexcused'(0). 절대 결석횟수 +1 (3회 누적 → 자동 실격).
  function markAbsence(pairingId, side, type) {
    const result =
      side === 'white'
        ? type === 'planned'
          ? 'white_bye_planned'
          : 'white_forfeit'
        : type === 'planned'
          ? 'black_bye_planned'
          : 'black_forfeit';
    update((d) => {
      const pr = d.pairings.find((p) => p.id === pairingId);
      if (!pr) return d;
      const absentId = side === 'white' ? pr.whitePlayerId : pr.blackPlayerId;
      d.pairings = d.pairings.map((p) =>
        p.id === pairingId ? { ...p, result, resultSource: 'admin' } : p,
      );
      if (absentId && absentId !== 'BOT') {
        d.players = d.players.map((p) =>
          p.id === absentId ? { ...p, absenceCount: (p.absenceCount ?? 0) + 1 } : p,
        );
      }
      return d;
    });
  }

  // ---- 녹아웃 결선 (3차) ----
  function startKnockout() {
    if (!db.standings.rows || db.standings.rows.length === 0)
      throw new Error('스위스 순위가 없어요. 먼저 라운드를 마감해 주세요.');
    if (db.tournament.knockoutStage) throw new Error('이미 녹아웃이 진행 중이에요.');
    // 운영자 확정 진출/탈락 오버라이드를 시드 선택에 반영 (항상 ≤16명).
    const overrides = Object.fromEntries(
      db.players.filter((p) => p.koOverride).map((p) => [p.id, p.koOverride]),
    );
    const entrants = seedEntrants(db.standings.rows, ADVANCE_COUNT, overrides);
    if (entrants.length < 2) throw new Error('진출자가 2명 이상이어야 해요.');
    const stage = startingStageFor(entrants.length);
    const matches = createInitialMatches(stage, entrants);
    const cfg = KO_CONFIG[stage];
    const round = {
      id: `KO_${stage}`,
      phase: 'knockout',
      stage,
      day: cfg.day,
      index: 16 + (['16강', '8강', '4강', '결승'].indexOf(stage) + 1),
      status: 'active',
      timeFormat: cfg.timeFormat,
      botRating: 0,
    };
    update((d) => {
      d.matches = matches;
      d.rounds.push(round);
      d.tournament.phase = 'knockout';
      d.tournament.knockoutStage = stage;
      d.tournament.currentRoundId = round.id;
      d.tournament.currentDay = cfg.day;
      return d;
    });
  }

  // 현재 첫 스테이지(예: 16강) 대진을 "지금 시딩 기준"으로 다시 짠다.
  // 대진 방식(크로스오버)이나 순위/오버라이드가 바뀐 뒤 재설정용.
  // 이미 다음 라운드로 진출했으면 불가(결과 보존). 이 스테이지의 기존 결과는 초기화된다.
  function reseedKnockout() {
    const stage = db.tournament.knockoutStage;
    if (!stage) throw new Error('녹아웃이 진행 중이 아니에요.');
    const koRounds = db.rounds.filter((r) => r.phase === 'knockout');
    if (koRounds.length > 1)
      throw new Error('이미 다음 라운드로 진출해 재설정할 수 없어요. (첫 스테이지에서만 가능)');
    const overrides = Object.fromEntries(
      db.players.filter((p) => p.koOverride).map((p) => [p.id, p.koOverride]),
    );
    const entrants = seedEntrants(db.standings.rows, ADVANCE_COUNT, overrides);
    if (entrants.length < 2) throw new Error('진출자가 2명 이상이어야 해요.');
    const matches = createInitialMatches(stage, entrants);
    update((d) => {
      d.matches = matches; // 같은 id(KO_stage_slot)로 덮어쓰기 — 기존 결과 폐기
      return d;
    });
  }

  // 매치 재평가 (draft 변경). 결승이 끝나면 우승 확정.
  function refreshMatch(d, match) {
    const r = evaluateMatch(match);
    match.status = r.status;
    match.winnerId = r.winnerId;
    if (r.needArmageddon && !match.armageddon) match.armageddon = newArmageddon(match);
    if (match.status === 'decided' && nextStage(match.stage) === null) {
      const stageMatches = d.matches.filter((x) => x.stage === match.stage);
      if (stageMatches.length === 1) {
        d.tournament.championId = match.winnerId;
        d.tournament.phase = 'finished';
      }
    }
  }

  function setMatchGameResult(matchId, gameNo, result) {
    update((d) => {
      const m = d.matches.find((x) => x.id === matchId);
      if (!m) return d;
      const g = m.games.find((x) => x.gameNo === gameNo);
      if (g) {
        g.result = result;
        g.resultSource = 'manual';
      }
      refreshMatch(d, m);
      return d;
    });
  }

  function setMatchArmageddon(matchId, result) {
    update((d) => {
      const m = d.matches.find((x) => x.id === matchId);
      if (!m) return d;
      if (!m.armageddon) m.armageddon = newArmageddon(m);
      m.armageddon.result = result;
      m.armageddon.resultSource = 'manual';
      refreshMatch(d, m);
      return d;
    });
  }

  // 녹아웃 게임 URL 자동 검증 (gameNo=null 이면 아마게돈)
  async function verifyKnockoutGame(matchId, gameNo, url) {
    const m = db.matches.find((x) => x.id === matchId);
    if (!m) throw new Error('매치를 찾을 수 없어요.');
    const gameUrl = String(url || '').trim();
    if (!gameUrl) throw new Error('게임 URL을 입력해 주세요.');
    const high = db.players.find((p) => p.id === m.playerHighId);
    const low = db.players.find((p) => p.id === m.playerLowId);
    if (!high || !low) throw new Error('매치 참가자 정보를 찾을 수 없어요.');

    const res = await verifyGameUrl(gameUrl, [high.chessUsername, low.chessUsername]);
    const isArma = gameNo == null;

    if (res.status === 'verified') {
      if (isArma && res.game.winner === 'draw') {
        return { ok: false, status: 'armageddon_draw', detail: '아마게돈은 무승부가 없어요.' };
      }
      let result;
      if (res.game.winner === 'draw') result = 'draw';
      else {
        const winnerKey =
          res.game.winner === 'white' ? res.game.whiteUsername : res.game.blackUsername;
        result = winnerKey === high.chessUsernameKey ? 'high_win' : 'low_win';
      }
      update((d) => {
        const mm = d.matches.find((x) => x.id === matchId);
        const slot = isArma ? mm.armageddon || (mm.armageddon = newArmageddon(mm)) : mm.games.find((x) => x.gameNo === gameNo);
        slot.result = result;
        slot.gameUrl = gameUrl;
        slot.pgn = res.game.pgn || null;
        slot.verified = true;
        slot.flagged = false;
        slot.resultSource = 'api';
        refreshMatch(d, mm);
        return d;
      });
      return { ok: true, result };
    }

    update((d) => {
      const mm = d.matches.find((x) => x.id === matchId);
      const slot = isArma ? mm.armageddon || (mm.armageddon = newArmageddon(mm)) : mm.games.find((x) => x.gameNo === gameNo);
      slot.gameUrl = gameUrl;
      slot.flagged = true;
      d.reviewQueue = (d.reviewQueue || []).concat([
        {
          id: `rq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          pairingId: `${matchId}#${isArma ? 'arma' : 'g' + gameNo}`,
          reason: res.status,
          gameUrl,
          detail: res.detail || '',
          createdAt: Date.now(),
          resolved: false,
        },
      ]);
      return d;
    });
    return { ok: false, status: res.status, detail: res.detail };
  }

  function advanceKnockout() {
    const stage = db.tournament.knockoutStage;
    if (!stage) throw new Error('녹아웃이 진행 중이 아니에요.');
    const stageMatches = db.matches.filter((m) => m.stage === stage);
    if (!isStageComplete(stageMatches))
      throw new Error('현재 스테이지의 모든 매치가 끝나야 진출이 가능해요.');
    const ns = nextStage(stage);
    if (!ns) throw new Error('이미 결승까지 끝났어요.');

    const seedMap = new Map();
    db.matches.forEach((m) => {
      if (!seedMap.has(m.playerHighId)) seedMap.set(m.playerHighId, m.seedHigh);
      if (!seedMap.has(m.playerLowId)) seedMap.set(m.playerLowId, m.seedLow);
    });
    const newMatches = createNextStageMatches(ns, stageMatches, seedMap);
    const cfg = KO_CONFIG[ns];
    const round = {
      id: `KO_${ns}`,
      phase: 'knockout',
      stage: ns,
      day: cfg.day,
      index: 16 + (['16강', '8강', '4강', '결승'].indexOf(ns) + 1),
      status: 'active',
      timeFormat: cfg.timeFormat,
      botRating: 0,
    };
    update((d) => {
      d.rounds = d.rounds.map((r) => (r.stage === stage ? { ...r, status: 'closed' } : r));
      d.matches = d.matches.concat(newMatches);
      d.tournament.knockoutStage = ns;
      d.tournament.currentRoundId = round.id;
      d.tournament.currentDay = cfg.day;
      d.rounds.push(round);
      return d;
    });
  }

  function adjustAbsence(playerId, delta) {
    update((d) => {
      d.players = d.players.map((p) =>
        p.id === playerId
          ? { ...p, absenceCount: Math.max(0, (p.absenceCount ?? 0) + delta) }
          : p,
      );
      d.standings = freshStandings(d); // 결석↔실격↔순위 일관성
      return d;
    });
  }

  // ---- 운영자: 데이터 보정 (지난 라운드 포함) ----
  // 순위만 다시 계산 (결과/명단을 직접 안 바꿀 때 쓰는 보조 버튼).
  function recomputeStandings() {
    update((d) => {
      d.standings = freshStandings(d);
      return d;
    });
  }

  // 임의 대진의 결과를 운영자가 교정 (마감된 라운드 포함) + 순위 즉시 반영.
  // 결과 문자열만 바꾸며, 결석 카운트는 건드리지 않음(별도 adjustAbsence 로 보정).
  function correctResult(pairingId, result) {
    update((d) => {
      d.pairings = d.pairings.map((p) =>
        p.id === pairingId ? { ...p, result, resultSource: 'admin' } : p,
      );
      d.standings = freshStandings(d);
      return d;
    });
  }

  // 실격/복귀 토글. status 변경 후 순위 재계산(실격자는 하단 분리 + 진출 제외).
  function setPlayerStatus(playerId, status) {
    update((d) => {
      d.players = d.players.map((p) => (p.id === playerId ? { ...p, status } : p));
      d.standings = freshStandings(d);
      return d;
    });
  }

  // 16강 확정 진출('in')/탈락('out') 오버라이드. null 이면 해제(자동 순위 기준).
  function setKoOverride(playerId, value) {
    update((d) => {
      d.players = d.players.map((p) => {
        if (p.id !== playerId) return p;
        const next = { ...p };
        if (value === 'in' || value === 'out') next.koOverride = value;
        else delete next.koOverride;
        return next;
      });
      d.standings = freshStandings(d); // 배지 표시용 koOverride 반영
      return d;
    });
  }

  // ---- 백업/복원 (라이브 데이터 안전망) ----
  // 현재 전체 db 를 JSON 파일로 내려받음 (저장소 변경 없음, 순수 읽기).
  function backupDb() {
    const stamp = new Date()
      .toISOString()
      .replace(/[:T]/g, '-')
      .replace(/\..+/, '')
      .slice(0, 16);
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chess-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // 백업 JSON 으로 전체 복원. update 의 diff sync 가 저장소를 백업 시점에 맞춰 set/delete.
  function restoreDb(parsed) {
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.players))
      throw new Error('백업 파일 형식이 올바르지 않아요. (players 배열이 필요)');
    update(() => ({ ...defaultDb(), ...parsed }));
  }

  function resetAll() {
    Promise.resolve(storeRef.current.clear()).catch((e) =>
      console.error('저장소 초기화 실패:', e),
    );
    setDb(defaultDb());
    // 운영자 로그인은 유지(데이터만 초기화) — 연속 작업 편의
  }

  const value = {
    db,
    user,
    loading,
    storeMode: storeRef.current.mode,
    confirmedPlayers,
    currentRound,
    currentPairings,
    currentMatches,
    // actions
    registerPlayer,
    loginPlayer,
    loginAdmin,
    loginAdminGoogle,
    logout,
    loadDemoPlayers,
    fetchRatings,
    confirmRoster,
    reopenRegistration,
    startRound,
    setResult,
    closeRound,
    verifySubmission,
    resolveReview,
    markAbsence,
    adjustAbsence,
    recomputeStandings,
    correctResult,
    setPlayerStatus,
    setKoOverride,
    backupDb,
    restoreDb,
    startKnockout,
    reseedKnockout,
    advanceKnockout,
    setMatchGameResult,
    setMatchArmageddon,
    verifyKnockoutGame,
    resetAll,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
