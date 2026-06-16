import { useApp } from '../state/AppContext.jsx';
import StandingsTable from '../components/StandingsTable.jsx';

export default function StandingsPage() {
  const { db, user } = useApp();
  const { standings, tournament } = db;
  const myId = user?.type === 'player' ? user.playerId : null;

  return (
    <div>
      <h1 className="page-title">순위표</h1>
      <p className="page-sub">
        스위스 예선 누적 승점 · 버흘홀츠 · 16강 진출선. 라운드 마감 시점에 갱신돼요.
      </p>

      <div className="card">
        <div className="stat-row" style={{ marginBottom: 16 }}>
          <div className="stat">
            <div className="k">단계</div>
            <div className="v">
              {tournament.phase === 'registration'
                ? '등록'
                : tournament.phase === 'swiss'
                  ? '스위스 예선'
                  : tournament.phase === 'knockout'
                    ? '녹아웃'
                    : '종료'}
            </div>
          </div>
          <div className="stat">
            <div className="k">라운드</div>
            <div className="v">
              {tournament.currentRoundIndex}/16
            </div>
          </div>
          <div className="stat">
            <div className="k">집계 기준</div>
            <div className="v">{standings.asOfRoundIndex}R</div>
          </div>
          <div className="stat">
            <div className="k">참가자</div>
            <div className="v">{db.players.length}명</div>
          </div>
        </div>

        <StandingsTable rows={standings.rows} highlightPlayerId={myId} />
      </div>
    </div>
  );
}
