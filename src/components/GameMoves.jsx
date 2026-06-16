import { parsePgnMoves } from '../services/chesscom.js';

// 검증된 게임의 기보(수순)를 보여줌. PGN이 없으면 Chess.com 링크로 폴백.
export default function GameMoves({ pgn, url }) {
  const moves = parsePgnMoves(pgn);

  if (moves.length === 0) {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer">
        ↗ Chess.com에서 기보 보기
      </a>
    ) : (
      <span className="muted">기보가 아직 없어요.</span>
    );
  }

  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ no: i / 2 + 1, white: moves[i], black: moves[i + 1] || '' });
  }

  return (
    <div>
      <div className="moves">
        {pairs.map((m) => (
          <span className="move" key={m.no}>
            <span className="move-no">{m.no}.</span> {m.white} {m.black}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: '0.82rem' }}>
        <span className="muted">총 {moves.length}수</span>
        {url && (
          <>
            {' · '}
            <a href={url} target="_blank" rel="noreferrer">
              ↗ Chess.com에서 보기
            </a>
          </>
        )}
      </div>
    </div>
  );
}
