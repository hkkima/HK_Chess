import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import GameMoves from '../components/GameMoves.jsx';

function MatchCard({ match, players, isAdmin, myId, actions }) {
  const { setMatchGameResult, setMatchArmageddon, verifyKnockoutGame } = actions;
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState({});
  const [msg, setMsg] = useState({});
  const [openMoves, setOpenMoves] = useState({});

  const high = players.find((p) => p.id === match.playerHighId);
  const low = players.find((p) => p.id === match.playerLowId);
  const highName = high ? high.name : '?';
  const lowName = low ? low.name : '?';
  const iAmIn = myId && (match.playerHighId === myId || match.playerLowId === myId);

  function resultLabel(r) {
    if (r === 'high_win') return `${highName} 승`;
    if (r === 'low_win') return `${lowName} 승`;
    if (r === 'draw') return '무';
    return '대기';
  }
  function nameOf(id) {
    return id === match.playerHighId ? highName : lowName;
  }

  async function doVerify(gameKey, gameNo) {
    const url = urls[gameKey] || '';
    setBusy((b) => ({ ...b, [gameKey]: true }));
    setMsg((m) => ({ ...m, [gameKey]: '' }));
    try {
      const res = await verifyKnockoutGame(match.id, gameNo, url);
      setMsg((m) => ({
        ...m,
        [gameKey]: res.ok
          ? `✅ 검증 완료 → ${resultLabel(res.result)}`
          : `검증 실패 (${res.status}): ${res.detail}`,
      }));
    } catch (e) {
      setMsg((m) => ({ ...m, [gameKey]: e.message }));
    } finally {
      setBusy((b) => ({ ...b, [gameKey]: false }));
    }
  }

  const winnerName = match.winnerId ? nameOf(match.winnerId) : null;

  function gameRow(g) {
    const key = `g${g.gameNo}`;
    return (
      <div key={key} className="ko-game">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>
            <b>{g.gameNo}판</b>{' '}
            <span className="disc w" style={{ display: 'inline-block', verticalAlign: 'middle' }} />{' '}
            {nameOf(g.whitePlayerId)} <span className="muted">vs</span> {nameOf(g.blackPlayerId)}{' '}
            <span className="disc b" style={{ display: 'inline-block', verticalAlign: 'middle' }} />
          </span>
          <span>
            {g.verified && <span className="badge">검증 ✓</span>}{' '}
            <b>{resultLabel(g.result)}</b>
          </span>
        </div>

        {isAdmin && (
          <select
            value={g.result}
            onChange={(e) => setMatchGameResult(match.id, g.gameNo, e.target.value)}
            style={{ width: 150, marginTop: 6 }}
          >
            <option value="pending">대기</option>
            <option value="high_win">{highName} 승</option>
            <option value="draw">무</option>
            <option value="low_win">{lowName} 승</option>
          </select>
        )}

        {!isAdmin && iAmIn && g.result === 'pending' && (
          <div className="row" style={{ marginTop: 6 }}>
            <input
              className="grow"
              placeholder="Chess.com 게임 URL"
              value={urls[key] || ''}
              onChange={(e) => setUrls((u) => ({ ...u, [key]: e.target.value }))}
            />
            <button onClick={() => doVerify(key, g.gameNo)} disabled={busy[key]}>
              {busy[key] ? '검증 중…' : '검증'}
            </button>
          </div>
        )}
        {msg[key] && <div className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>{msg[key]}</div>}

        {(g.pgn || g.gameUrl) && (
          <div style={{ marginTop: 4 }}>
            <button
              className="ghost"
              style={{ padding: '2px 8px', fontSize: '0.76rem' }}
              onClick={() => setOpenMoves((o) => ({ ...o, [key]: !o[key] }))}
            >
              {openMoves[key] ? '기보 닫기' : '📜 기보'}
            </button>
            {openMoves[key] && (
              <div style={{ marginTop: 6 }}>
                <GameMoves pgn={g.pgn} url={g.gameUrl} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const a = match.armageddon;
  return (
    <div className={`card ${iAmIn ? 'pairing mine' : ''}`} style={{ marginBottom: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <b>
          [{match.seedHigh}] {highName} <span className="muted">vs</span> {lowName} [{match.seedLow}]
        </b>
        <span>
          {iAmIn && <span className="badge mine">내 매치</span>}{' '}
          {match.status === 'decided' ? (
            <span className="badge gold">🏆 {winnerName}</span>
          ) : (
            <span className="badge">진행 중</span>
          )}
        </span>
      </div>

      {match.games.map(gameRow)}

      {a && (
        <div className="ko-game" style={{ borderTop: '2px dashed var(--gold)', paddingTop: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              <b>⚔️ 아마게돈</b> · {nameOf(a.whitePlayerId)}{' '}
              <span className="muted">(백)</span> vs {nameOf(a.blackPlayerId)}{' '}
              <span className="muted">(흑)</span>
            </span>
            <b>{a.result === 'high_win' ? `${highName} 승` : a.result === 'low_win' ? `${lowName} 승` : '대기'}</b>
          </div>
          {isAdmin && (
            <select
              value={a.result}
              onChange={(e) => setMatchArmageddon(match.id, e.target.value)}
              style={{ width: 150, marginTop: 6 }}
            >
              <option value="pending">대기</option>
              <option value="high_win">{highName} 승</option>
              <option value="low_win">{lowName} 승</option>
            </select>
          )}
          {!isAdmin && iAmIn && a.result === 'pending' && (
            <div className="row" style={{ marginTop: 6 }}>
              <input
                className="grow"
                placeholder="아마게돈 게임 URL"
                value={urls.arma || ''}
                onChange={(e) => setUrls((u) => ({ ...u, arma: e.target.value }))}
              />
              <button onClick={() => doVerify('arma', null)} disabled={busy.arma}>
                {busy.arma ? '검증 중…' : '검증'}
              </button>
            </div>
          )}
          {msg.arma && <div className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>{msg.arma}</div>}
        </div>
      )}
    </div>
  );
}

export default function BracketPage() {
  const {
    db,
    user,
    currentMatches,
    setMatchGameResult,
    setMatchArmageddon,
    verifyKnockoutGame,
  } = useApp();
  const isAdmin = user?.type === 'admin';
  const myId = user?.type === 'player' ? user.playerId : null;
  const stage = db.tournament.knockoutStage;
  const champion = db.tournament.championId
    ? db.players.find((p) => p.id === db.tournament.championId)
    : null;

  return (
    <div>
      <h1 className="page-title">녹아웃 브래킷</h1>
      <p className="page-sub">2판 미니매치 · 1:1이면 아마게돈으로 결판. 스위스 최종 순위로 시드 배정.</p>

      {champion && (
        <div className="card" style={{ textAlign: 'center', background: 'var(--accent-soft)' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>🏆 우승: {champion.name}</div>
          <div className="muted">@{champion.chessUsername}</div>
        </div>
      )}

      {!stage ? (
        <div className="card">
          <p className="muted">아직 녹아웃이 시작되지 않았어요. 운영자가 스위스 마감 후 시작한다옹 🐾</p>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="stat-row">
              <div className="stat">
                <div className="k">스테이지</div>
                <div className="v">{stage}</div>
              </div>
              <div className="stat">
                <div className="k">매치</div>
                <div className="v">{currentMatches.length}</div>
              </div>
              <div className="stat">
                <div className="k">단계</div>
                <div className="v">{db.tournament.phase === 'finished' ? '종료' : '진행'}</div>
              </div>
            </div>
          </div>

          {currentMatches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              players={db.players}
              isAdmin={isAdmin}
              myId={myId}
              actions={{ setMatchGameResult, setMatchArmageddon, verifyKnockoutGame }}
            />
          ))}
        </>
      )}
    </div>
  );
}
