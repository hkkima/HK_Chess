import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import GameMoves from '../components/GameMoves.jsx';

function PlayerName({ id, players, botRating }) {
  if (id === 'BOT') {
    return (
      <span>
        🤖 봇 <span className="muted">({botRating})</span>
      </span>
    );
  }
  const p = players.find((x) => x.id === id);
  return <span>{p ? p.name : '?'}</span>;
}

const RESULT_LABEL = {
  pending: '대기 중',
  white_win: '백 승',
  black_win: '흑 승',
  draw: '무승부',
};

export default function PairingsPage() {
  const { db, currentRound, currentPairings, user } = useApp();
  const myId = user?.type === 'player' ? user.playerId : null;
  const [openMoves, setOpenMoves] = useState({});

  return (
    <div>
      <h1 className="page-title">대진표</h1>
      <p className="page-sub">현재 라운드 대진이에요. 본인 대진은 황금빛으로 강조돼요.</p>

      {!currentRound ? (
        <div className="card">
          <p className="muted">아직 시작된 라운드가 없어요. 운영자가 라운드를 열면 대진이 나타난다옹 🐾</p>
        </div>
      ) : (
        <div className="card">
          <div className="stat-row" style={{ marginBottom: 16 }}>
            <div className="stat">
              <div className="k">라운드</div>
              <div className="v">R{currentRound.index}</div>
            </div>
            <div className="stat">
              <div className="k">일차</div>
              <div className="v">{currentRound.day}일차</div>
            </div>
            <div className="stat">
              <div className="k">타임</div>
              <div className="v" style={{ fontSize: '0.95rem' }}>
                {currentRound.timeFormat}
              </div>
            </div>
            <div className="stat">
              <div className="k">봇 레이팅</div>
              <div className="v">{currentRound.botRating}</div>
            </div>
          </div>

          {currentPairings.map((p) => {
            const mine = p.whitePlayerId === myId || p.blackPlayerId === myId;
            return (
              <div key={p.id} className={`pairing ${mine ? 'mine' : ''}`}>
                <div className="vs">
                  <span className="muted" style={{ width: 28 }}>
                    {p.board}
                  </span>
                  <span className="side white">
                    <span className="disc w" />
                    <PlayerName id={p.whitePlayerId} players={db.players} botRating={currentRound.botRating} />
                  </span>
                  <span className="mid">vs</span>
                  <span className="side black">
                    <PlayerName id={p.blackPlayerId} players={db.players} botRating={currentRound.botRating} />
                    <span className="disc b" />
                  </span>
                </div>
                <div className="result">
                  {mine && <span className="badge mine">내 대진</span>}{' '}
                  {p.isBotGame && <span className="badge bot">봇 게임</span>}{' '}
                  {p.verified && <span className="badge">검증됨 ✓</span>}{' '}
                  결과: <b>{RESULT_LABEL[p.result]}</b>
                  {(p.pgn || p.gameUrl) && (
                    <>
                      {' · '}
                      <button
                        className="ghost"
                        style={{ padding: '2px 8px', fontSize: '0.78rem' }}
                        onClick={() => setOpenMoves((o) => ({ ...o, [p.id]: !o[p.id] }))}
                      >
                        {openMoves[p.id] ? '기보 닫기' : '📜 기보 보기'}
                      </button>
                    </>
                  )}
                </div>
                {openMoves[p.id] && (
                  <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                    <GameMoves pgn={p.pgn} url={p.gameUrl} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
