import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext.jsx';

const RESULTS = [
  { v: 'pending', label: '대기' },
  { v: 'white_win', label: '백 승' },
  { v: 'black_win', label: '흑 승' },
  { v: 'draw', label: '무' },
];

// 운영자 결과 교정용 전체 옵션 (불참 포함). 봇 게임은 불참 옵션을 숨긴다.
function ResultOptions({ isBotGame }) {
  return (
    <>
      {RESULTS.map((r) => (
        <option key={r.v} value={r.v}>
          {r.label}
        </option>
      ))}
      {!isBotGame && (
        <>
          <option value="white_forfeit">백 불참(무단)</option>
          <option value="black_forfeit">흑 불참(무단)</option>
          <option value="white_bye_planned">백 불참(사전)</option>
          <option value="black_bye_planned">흑 불참(사전)</option>
        </>
      )}
    </>
  );
}

function name(players, id, botRating) {
  if (id === 'BOT') return `🤖 봇(${botRating})`;
  const p = players.find((x) => x.id === id);
  return p ? p.name : '?';
}

export default function AdminPanel() {
  const {
    db,
    user,
    loading,
    currentRound,
    currentPairings,
    loadDemoPlayers,
    fetchRatings,
    confirmRoster,
    reopenRegistration,
    startRound,
    closeRound,
    setResult,
    markAbsence,
    resolveReview,
    startKnockout,
    advanceKnockout,
    resetAll,
    adjustAbsence,
    correctResult,
    setPlayerStatus,
    setKoOverride,
    backupDb,
    restoreDb,
  } = useApp();
  const [error, setError] = useState('');
  const [ratingMsg, setRatingMsg] = useState('');
  const [ratingBusy, setRatingBusy] = useState(false);
  const [editRoundId, setEditRoundId] = useState(null); // 결과 수정: 펼친 라운드
  const [restoreMsg, setRestoreMsg] = useState('');

  function onRestoreFile(e) {
    setError('');
    setRestoreMsg('');
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (
          !window.confirm(
            '백업 파일로 전체 데이터를 덮어씁니다. 현재 데이터는 사라져요. 계속할까요?',
          )
        )
          return;
        restoreDb(parsed);
        setRestoreMsg('복원 완료 — 백업 시점 데이터로 되돌렸어요.');
      } catch (err) {
        setError(`복원 실패: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // 같은 파일 재선택 허용
  }

  function onResetAll() {
    if (
      window.confirm('정말 모든 데이터를 삭제합니까? 되돌릴 수 없어요. (백업 먼저 권장)') &&
      window.confirm('마지막 확인 — 참가자·라운드·순위가 전부 삭제됩니다.')
    ) {
      run(resetAll);
    }
  }

  async function runFetchRatings() {
    setError('');
    setRatingMsg('');
    setRatingBusy(true);
    try {
      const res = await fetchRatings();
      setRatingMsg(`Chess.com 레이팅 조회 완료 — ${res.total}명 중 ${res.withRating}명 보유 (나머지는 실력등급 근사 사용).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setRatingBusy(false);
    }
  }

  if (!user || user.type !== 'admin') {
    return (
      <div>
        <h1 className="page-title">운영자 패널</h1>
        <div className="card">
          <p className="muted">
            운영자 전용이에요. <Link to="/login">운영자로 로그인</Link>해 주세요 👑
          </p>
        </div>
      </div>
    );
  }

  // 운영자 로그인 직후 전체 데이터를 다시 불러오는 중에는 부분 데이터로 조작하지 못하게 막는다.
  if (loading) {
    return (
      <div>
        <h1 className="page-title">운영자 패널</h1>
        <div className="card">
          <p className="muted">전체 데이터를 불러오는 중이에요… 잠시만요 🐾</p>
        </div>
      </div>
    );
  }

  function run(fn) {
    setError('');
    try {
      fn();
    } catch (err) {
      setError(err.message);
    }
  }

  function onResultChange(pid, value) {
    if (value.endsWith('_planned') || value.endsWith('_forfeit')) {
      const side = value.startsWith('white') ? 'white' : 'black';
      const type = value.endsWith('_planned') ? 'planned' : 'unexcused';
      run(() => markAbsence(pid, side, type));
    } else {
      run(() => setResult(pid, value));
    }
  }

  const t = db.tournament;
  const allDone = t.currentRoundIndex >= 16 && (!currentRound || currentRound.status === 'closed');

  return (
    <div>
      <h1 className="page-title">운영자 패널</h1>
      <p className="page-sub">명단 확정 · 라운드 시작/마감 · 결과 입력 · 순위 갱신을 여기서 지휘해요.</p>

      {error && <div className="error">{error}</div>}

      {/* 명단 */}
      <div className="card">
        <div className="section-title">1. 명단 ({db.players.length}명)</div>
        {ratingMsg && <div className="ok">{ratingMsg}</div>}
        <div className="row">
          {db.players.length === 0 && (
            <button onClick={() => run(loadDemoPlayers)}>🐾 데모 23명 채우기</button>
          )}
          {db.players.length > 0 && (
            <button onClick={runFetchRatings} disabled={ratingBusy}>
              {ratingBusy ? '🌐 조회 중…' : '🌐 Chess.com 레이팅 가져오기'}
            </button>
          )}
          {!t.rosterConfirmed ? (
            <button className="primary" onClick={() => run(confirmRoster)}>
              명단 확정 (등록 마감)
            </button>
          ) : (
            <>
              <span className="badge">명단 확정됨 ✓</span>
              {t.currentRoundIndex === 0 && (
                <button className="ghost" onClick={() => run(reopenRegistration)}>
                  등록 다시 열기
                </button>
              )}
            </>
          )}
        </div>

        {db.players.length > 0 && (
          <table className="standings" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>참가자</th>
                <th>실력</th>
                <th>레이팅</th>
                <th>결석</th>
                <th>16강</th>
                <th>실격</th>
              </tr>
            </thead>
            <tbody>
              {db.players.map((p) => {
                const dq = p.status === 'disqualified';
                return (
                  <tr key={p.id} className={dq ? 'dq' : ''}>
                    <td className="name">
                      {p.name}
                      {dq && <span className="badge danger"> 실격</span>}
                      {p.koOverride === 'in' && <span className="badge"> 확정진출</span>}
                      {p.koOverride === 'out' && <span className="badge danger"> 확정탈락</span>}
                      <span className="uname">@{p.chessUsername}</span>
                    </td>
                    <td>{p.skill}</td>
                    <td>
                      {p.rating != null ? <b>{p.rating}</b> : <span className="muted">—</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="ghost"
                        style={{ padding: '0 8px' }}
                        onClick={() => run(() => adjustAbsence(p.id, -1))}
                      >
                        −
                      </button>
                      <b style={{ margin: '0 4px' }}>{p.absenceCount ?? 0}</b>
                      <button
                        className="ghost"
                        style={{ padding: '0 8px' }}
                        onClick={() => run(() => adjustAbsence(p.id, +1))}
                      >
                        +
                      </button>
                    </td>
                    <td>
                      <select
                        value={p.koOverride ?? 'auto'}
                        onChange={(e) =>
                          run(() =>
                            setKoOverride(p.id, e.target.value === 'auto' ? null : e.target.value),
                          )
                        }
                        style={{ width: 96 }}
                      >
                        <option value="auto">자동</option>
                        <option value="in">확정진출</option>
                        <option value="out">확정탈락</option>
                      </select>
                    </td>
                    <td>
                      <button
                        className={dq ? 'ghost' : 'danger'}
                        onClick={() =>
                          run(() => setPlayerStatus(p.id, dq ? 'confirmed' : 'disqualified'))
                        }
                      >
                        {dq ? '복귀' : '실격'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 라운드 제어 */}
      <div className="card">
        <div className="section-title">2. 라운드 제어</div>
        <div className="stat-row" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="k">진행</div>
            <div className="v">{t.currentRoundIndex}/16</div>
          </div>
          <div className="stat">
            <div className="k">현재 라운드</div>
            <div className="v">{currentRound ? `R${currentRound.index} · ${currentRound.status}` : '–'}</div>
          </div>
          <div className="stat">
            <div className="k">봇 레이팅</div>
            <div className="v">{currentRound ? currentRound.botRating : '–'}</div>
          </div>
        </div>
        <div className="row">
          <button
            className="primary"
            disabled={!t.rosterConfirmed || (currentRound && currentRound.status === 'active') || allDone}
            onClick={() => run(startRound)}
          >
            ▶ 라운드 시작 (페어링 생성)
          </button>
          <button
            disabled={!currentRound || currentRound.status === 'closed'}
            onClick={() => run(closeRound)}
          >
            ■ 라운드 마감 (순위 갱신)
          </button>
        </div>
        {allDone && <p className="notice" style={{ marginTop: 12 }}>스위스 16라운드 완료! 🎉 (녹아웃은 3차 업데이트)</p>}
      </div>

      {/* 녹아웃 제어 */}
      {(t.phase === 'swiss' || t.phase === 'knockout' || t.phase === 'finished') && (
        <div className="card">
          <div className="section-title">녹아웃 결선</div>
          {!t.knockoutStage ? (
            <>
              <p className="muted" style={{ fontSize: '0.85rem', marginTop: -6 }}>
                스위스 라운드를 마감해 최종 순위가 나오면, 상위 16명으로 녹아웃을 시작해요.
              </p>
              <button
                className="primary"
                disabled={!db.standings.rows || db.standings.rows.length === 0}
                onClick={() => run(startKnockout)}
              >
                🏆 녹아웃 시작 (상위 16 시드)
              </button>
            </>
          ) : (
            <>
              <div className="stat-row" style={{ marginBottom: 12 }}>
                <div className="stat">
                  <div className="k">스테이지</div>
                  <div className="v">{t.knockoutStage}</div>
                </div>
                <div className="stat">
                  <div className="k">상태</div>
                  <div className="v">{t.phase === 'finished' ? '종료' : '진행'}</div>
                </div>
              </div>
              <p className="muted" style={{ fontSize: '0.82rem', marginTop: -4 }}>
                매치 결과 입력은 <Link to="/bracket">브래킷 페이지</Link>에서 해요.
              </p>
              {t.phase !== 'finished' && t.knockoutStage !== '결승' && (
                <button onClick={() => run(advanceKnockout)}>▶ 다음 라운드 진출</button>
              )}
              {t.phase === 'finished' && (
                <div className="notice">🎉 결승까지 종료! 우승자가 확정됐어요.</div>
              )}
            </>
          )}
        </div>
      )}

      {/* 결과 입력 (스위스) */}
      {currentRound && currentRound.status === 'active' && currentRound.phase === 'swiss' && (
        <div className="card">
          <div className="section-title">R{currentRound.index} 결과 입력</div>
          {currentPairings.map((p) => (
            <div key={p.id} className="row" style={{ marginBottom: 8 }}>
              <span style={{ width: 28 }} className="muted">
                {p.board}
              </span>
              <span className="grow" style={{ minWidth: 160 }}>
                {name(db.players, p.whitePlayerId, currentRound.botRating)}
                <span className="muted"> vs </span>
                {name(db.players, p.blackPlayerId, currentRound.botRating)}
                {p.isBotGame && <span className="badge bot"> 봇</span>}
                {p.verified && <span className="badge"> 검증됨 ✓</span>}
                {p.flagged && <span className="badge danger"> 확인 대기</span>}
              </span>
              <select value={p.result} onChange={(e) => onResultChange(p.id, e.target.value)} style={{ width: 150 }}>
                {RESULTS.map((r) => (
                  <option key={r.v} value={r.v}>
                    {r.label}
                  </option>
                ))}
                {!p.isBotGame && (
                  <>
                    <option value="white_forfeit">백 불참(무단)</option>
                    <option value="black_forfeit">흑 불참(무단)</option>
                    <option value="white_bye_planned">백 불참(사전)</option>
                    <option value="black_bye_planned">흑 불참(사전)</option>
                  </>
                )}
              </select>
            </div>
          ))}
          <p className="muted" style={{ fontSize: '0.82rem' }}>
            결과를 모두 채운 뒤 위의 <b>라운드 마감</b>을 누르면 순위가 갱신돼요. 불참 선택 시 결석 1회가 누적되고, 3회면 자동 실격돼요.
          </p>
        </div>
      )}

      {/* 검증 대기열 */}
      {(() => {
        const pending = (db.reviewQueue || []).filter((x) => !x.resolved);
        if (pending.length === 0) return null;
        const REASON = {
          username_mismatch: '유저네임 불일치',
          game_not_found: '게임 못 찾음',
          invalid_url: 'URL 형식 오류',
          api_error: 'API 오류',
        };
        return (
          <div className="card">
            <div className="section-title">
              4. Chess.com 검증 대기 ({pending.length})
            </div>
            <p className="muted" style={{ fontSize: '0.82rem', marginTop: -6 }}>
              자동 검증을 통과하지 못한 제출이에요. 직접 확인 후 결과를 정해 주세요.
            </p>
            {pending.map((item) => {
              const p = db.pairings.find((x) => x.id === item.pairingId);
              return (
                <div key={item.id} className="row" style={{ marginBottom: 10, alignItems: 'flex-start' }}>
                  <span className="grow" style={{ minWidth: 200 }}>
                    <span className="badge danger">{REASON[item.reason] || item.reason}</span>{' '}
                    {p ? (
                      <>
                        {name(db.players, p.whitePlayerId, p ? 0 : 0)}
                        <span className="muted"> vs </span>
                        {name(db.players, p.blackPlayerId, 0)}
                      </>
                    ) : (
                      '대진 정보 없음'
                    )}
                    <span className="uname" style={{ display: 'block', wordBreak: 'break-all' }}>
                      {item.detail}
                      <br />
                      <a href={item.gameUrl} target="_blank" rel="noreferrer">
                        {item.gameUrl}
                      </a>
                    </span>
                  </span>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) resolveReview(item.id, e.target.value);
                    }}
                    style={{ width: 130 }}
                  >
                    <option value="" disabled>
                      결과 정하기
                    </option>
                    <option value="white_win">백 승</option>
                    <option value="black_win">흑 승</option>
                    <option value="draw">무</option>
                  </select>
                  <button className="ghost" onClick={() => resolveReview(item.id)}>
                    무시
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* 결과 수정 (지난 라운드 포함) */}
      {db.rounds.filter((r) => r.phase === 'swiss').length > 0 && (
        <div className="card">
          <div className="section-title">결과 수정 (지난 라운드 포함)</div>
          <p className="muted" style={{ fontSize: '0.82rem', marginTop: -6 }}>
            잘못 입력된 승패를 마감된 라운드에서도 고칠 수 있어요. 바꾸면 순위가 즉시 다시 계산돼요.
            (불참으로 바꿔도 결석 횟수는 자동 증가하지 않으니, 결석은 위 명단의 ± 로 따로 보정하세요.)
          </p>
          {db.rounds
            .filter((r) => r.phase === 'swiss')
            .map((r) => {
              const open = editRoundId === r.id;
              const prs = db.pairings.filter((p) => p.roundId === r.id);
              return (
                <div key={r.id} style={{ marginBottom: 6 }}>
                  <button
                    className="ghost"
                    onClick={() => setEditRoundId(open ? null : r.id)}
                    style={{ width: '100%', textAlign: 'left' }}
                  >
                    {open ? '▾' : '▸'} R{r.index} · {r.status} ({prs.length}경기)
                  </button>
                  {open &&
                    prs.map((p) => (
                      <div key={p.id} className="row" style={{ margin: '6px 0 6px 16px' }}>
                        <span className="grow" style={{ minWidth: 160 }}>
                          {name(db.players, p.whitePlayerId, r.botRating)}
                          <span className="muted"> vs </span>
                          {name(db.players, p.blackPlayerId, r.botRating)}
                          {p.isBotGame && <span className="badge bot"> 봇</span>}
                        </span>
                        <select
                          value={p.result}
                          onChange={(e) => run(() => correctResult(p.id, e.target.value))}
                          style={{ width: 150 }}
                        >
                          <ResultOptions isBotGame={p.isBotGame} />
                        </select>
                      </div>
                    ))}
                </div>
              );
            })}
        </div>
      )}

      {/* 백업 / 복원 */}
      <div className="card">
        <div className="section-title">백업 / 복원</div>
        {restoreMsg && <div className="ok">{restoreMsg}</div>}
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: -6 }}>
          코드 배포는 데이터를 건드리지 않지만, 큰 변경 전엔 백업을 받아두면 안전해요.
        </p>
        <div className="row">
          <button onClick={() => run(backupDb)}>💾 백업 (JSON 내보내기)</button>
          <label
            style={{
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.95rem',
              border: '1px solid var(--line)',
              background: 'transparent',
              color: 'var(--ink)',
              padding: '10px 16px',
              borderRadius: 10,
            }}
          >
            ♻️ 복원 (JSON 가져오기)
            <input
              type="file"
              accept="application/json,.json"
              onChange={onRestoreFile}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {/* 위험 구역 */}
      <div className="card">
        <div className="section-title">위험 구역</div>
        <button className="danger" onClick={onResetAll}>
          전체 초기화 (모든 데이터 삭제)
        </button>
      </div>
    </div>
  );
}
