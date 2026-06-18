import { ADVANCE_COUNT } from '../domain/rules.js';

export default function StandingsTable({ rows, highlightPlayerId }) {
  if (!rows || rows.length === 0) {
    return (
      <p className="muted">
        아직 집계된 순위가 없어요. 운영자가 라운드를 <b>마감</b>하면 순위가 갱신된다옹.
      </p>
    );
  }

  const out = [];
  rows.forEach((r, i) => {
    out.push(
      <tr
        key={r.playerId}
        className={`${r.qualified ? 'qualify' : ''} ${r.disqualified ? 'dq' : ''} ${
          r.playerId === highlightPlayerId ? 'me' : ''
        }`}
      >
        <td className="rank">{r.disqualified ? '–' : r.rank}</td>
        <td className="name">
          {r.name}
          {r.playerId === highlightPlayerId && <span className="badge mine"> 나</span>}
          {r.disqualified && <span className="badge danger"> 실격</span>}
          {r.koOverride === 'in' && <span className="badge gold"> 확정진출</span>}
          {r.koOverride === 'out' && <span className="badge danger"> 확정탈락</span>}
          <span className="uname">@{r.chessUsername}</span>
        </td>
        <td>
          <b>{r.points}</b>
        </td>
        <td className="hide-sm">{r.buchholz}</td>
        <td className="hide-sm">{r.absences}</td>
      </tr>,
    );
    // 진출선 (16위 아래에 점선)
    const nextNonDq = rows.slice(i + 1).find((x) => !x.disqualified);
    if (r.rank === ADVANCE_COUNT && nextNonDq) {
      out.push(
        <tr className="qualify-line" key="qline">
          <td colSpan={5}>
            <div className="line">
              <span className="label">▲ 16강 진출선 ▲</span>
            </div>
          </td>
        </tr>,
      );
    }
  });

  return (
    <table className="standings">
      <thead>
        <tr>
          <th>#</th>
          <th style={{ textAlign: 'left' }}>참가자</th>
          <th>승점</th>
          <th className="hide-sm">버흘홀츠</th>
          <th className="hide-sm">결석</th>
        </tr>
      </thead>
      <tbody>{out}</tbody>
    </table>
  );
}
