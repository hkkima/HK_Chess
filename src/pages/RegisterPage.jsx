import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';

const SKILLS = [
  { v: 'A', label: 'A · 좀 둬봤어요' },
  { v: 'B', label: 'B · 보통이에요' },
  { v: 'C', label: 'C · 거의 처음' },
];

export default function RegisterPage() {
  const { db, registerPlayer } = useApp();
  const [form, setForm] = useState({ name: '', chessUsername: '', skill: '', pin: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  const open = db.tournament.registrationOpen;

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const p = await registerPlayer(form);
      setDone(p);
      setForm({ name: '', chessUsername: '', skill: '', pin: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">참가 등록</h1>
      <p className="page-sub">
        Chess.com 유저네임이 곧 <b>로그인 ID</b>예요. 이름과 실력 단계, 로그인용 PIN을 정해 주세요.
      </p>

      <div className="card">
        <div className="notice" style={{ marginBottom: 16 }}>
          현재 등록 인원: <b>{db.players.length}명</b> {open ? '· 등록 받는 중이에요 🐾' : '· 등록 마감'}
        </div>

        {done && (
          <div className="ok">
            <b>{done.name}</b> 님, 등록 완료! 로그인은 <b>{done.chessUsername}</b> + PIN 으로 들어와요 🐱
          </div>
        )}
        {error && <div className="error">{error}</div>}

        {!open ? (
          <p className="muted">등록이 마감되었어요. 운영자에게 문의해 주세요.</p>
        ) : (
          <form onSubmit={submit}>
            <label className="field">
              <span>이름 / 닉네임</span>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="예: 나비" />
            </label>
            <label className="field">
              <span>Chess.com 유저네임 (= 로그인 ID, 필수)</span>
              <input
                value={form.chessUsername}
                onChange={(e) => set('chessUsername', e.target.value)}
                placeholder="예: navi_cat"
                autoCapitalize="none"
              />
            </label>
            <label className="field">
              <span>실력 단계</span>
              <div className="skill-group">
                {SKILLS.map((s) => (
                  <button
                    type="button"
                    key={s.v}
                    className={form.skill === s.v ? 'selected' : ''}
                    onClick={() => set('skill', s.v)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </label>
            <label className="field">
              <span>숫자 PIN (4~8자리)</span>
              <input
                value={form.pin}
                onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))}
                placeholder="예: 1234"
                inputMode="numeric"
              />
            </label>
            <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? '🔍 Chess.com 유저 확인 중…' : '등록하기'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
