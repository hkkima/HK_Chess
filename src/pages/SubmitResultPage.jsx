import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext.jsx';
import GameMoves from '../components/GameMoves.jsx';

const RESULT_LABEL = {
  pending: '미입력',
  white_win: '백 승',
  black_win: '흑 승',
  draw: '무승부',
};

export default function SubmitResultPage() {
  const { db, user, currentRound, currentPairings, verifySubmission, setResult } = useApp();
  const [gameUrl, setGameUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showManual, setShowManual] = useState(false);

  if (!user || user.type !== 'player') {
    return (
      <div>
        <h1 className="page-title">결과 제출</h1>
        <div className="card">
          <p className="muted">
            결과를 제출하려면 먼저 <Link to="/login">로그인</Link>해 주세요 🐾
          </p>
        </div>
      </div>
    );
  }

  const myId = user.playerId;
  const isKnockout = db.tournament.phase === 'knockout' || db.tournament.phase === 'finished';
  const mine = currentPairings.find((p) => p.whitePlayerId === myId || p.blackPlayerId === myId);
  const iAmWhite = mine && mine.whitePlayerId === myId;
  const oppId = mine ? (iAmWhite ? mine.blackPlayerId : mine.whitePlayerId) : null;
  const opp =
    oppId === 'BOT' ? { name: '🤖 봇' } : db.players.find((x) => x.id === oppId) || null;

  async function autoVerify() {
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const res = await verifySubmission(mine.id, gameUrl);
      if (res.ok) {
        setMsg(`✅ 검증 완료! Chess.com 대조 결과 → ${RESULT_LABEL[res.result]}. 라운드 마감 시 순위에 반영돼요 🐱`);
      } else {
        setErr(`자동 검증을 통과하지 못했어요 (${res.status}): ${res.detail} — 운영자 확인 대기로 넘겼어요.`);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function reportManual(outcome) {
    let result;
    if (outcome === 'draw') result = 'draw';
    else if (outcome === 'win') result = iAmWhite ? 'white_win' : 'black_win';
    else result = iAmWhite ? 'black_win' : 'white_win';
    setResult(mine.id, result, gameUrl || null);
    setMsg('수동 입력 완료! (검증 없이) 운영자가 라운드를 마감하면 반영돼요.');
  }

  return (
    <div>
      <h1 className="page-title">결과 제출</h1>
      <p className="page-sub">
        Chess.com에서 둔 경기의 <b>게임 URL</b>을 내면, 양쪽 유저네임을 자동 대조해 결과를 확정해요.
      </p>

      {isKnockout ? (
        <div className="card">
          <p className="muted">
            지금은 녹아웃 결선이에요. 결과 제출은 <Link to="/bracket">브래킷 페이지</Link>의 내 매치에서 해주세요 🏆
          </p>
        </div>
      ) : !currentRound ? (
        <div className="card">
          <p className="muted">진행 중인 라운드가 없어요.</p>
        </div>
      ) : !mine ? (
        <div className="card">
          <p className="muted">이번 라운드에 배정된 대진을 찾지 못했어요.</p>
        </div>
      ) : (
        <div className="card">
          {msg && <div className="ok">{msg}</div>}
          {err && <div className="error">{err}</div>}

          <p>
            <b>R{currentRound.index}</b> · 나는 <b>{iAmWhite ? '백' : '흑'}</b>, 상대는{' '}
            <b>{opp ? opp.name : '?'}</b>
            {mine.isBotGame && <span className="badge bot"> 봇 게임</span>}
            {mine.verified && <span className="badge"> 검증됨 ✓</span>}
            {mine.flagged && <span className="badge danger"> 확인 대기</span>}
          </p>
          <p className="muted" style={{ marginTop: -4 }}>
            현재 기록된 결과: <b>{RESULT_LABEL[mine.result]}</b>
          </p>

          {(mine.pgn || mine.verified) && (
            <div style={{ margin: '12px 0' }}>
              <div className="section-title" style={{ fontSize: '0.95rem' }}>📜 기보</div>
              <GameMoves pgn={mine.pgn} url={mine.gameUrl} />
            </div>
          )}

          {mine.isBotGame ? (
            <>
              <div className="notice" style={{ marginBottom: 12 }}>
                봇 게임은 자동 검증 대상이 아니에요. 결과를 직접 알려주세요 🐾
              </div>
              <div className="row">
                <button className="primary grow" onClick={() => reportManual('win')}>
                  내가 이겼어요
                </button>
                <button className="grow" onClick={() => reportManual('draw')}>
                  비겼어요
                </button>
                <button className="grow" onClick={() => reportManual('loss')}>
                  내가 졌어요
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="field">
                <span>Chess.com 게임 URL</span>
                <input
                  value={gameUrl}
                  onChange={(e) => setGameUrl(e.target.value)}
                  placeholder="https://www.chess.com/game/live/..."
                  autoCapitalize="none"
                />
              </label>
              <button className="primary" onClick={autoVerify} disabled={busy} style={{ width: '100%' }}>
                {busy ? '🔍 Chess.com에서 대조 중…' : 'URL로 자동 검증하고 제출'}
              </button>

              <p style={{ marginTop: 14 }}>
                <button className="ghost" onClick={() => setShowManual((v) => !v)} style={{ fontSize: '0.82rem', padding: '4px 8px' }}>
                  {showManual ? '▲ 수동 입력 닫기' : '▼ 자동 검증이 안 될 때 (수동 입력)'}
                </button>
              </p>
              {showManual && (
                <div className="row">
                  <button className="grow" onClick={() => reportManual('win')}>
                    내가 이겼어요
                  </button>
                  <button className="grow" onClick={() => reportManual('draw')}>
                    비겼어요
                  </button>
                  <button className="grow" onClick={() => reportManual('loss')}>
                    내가 졌어요
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
