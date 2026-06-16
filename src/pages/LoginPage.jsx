import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext.jsx';

export default function LoginPage() {
  const { loginPlayer, loginAdmin, loginAdminGoogle, storeMode } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState('player');
  const [loginId, setLoginId] = useState('');
  const [pin, setPin] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  async function submitGoogle() {
    setError('');
    try {
      await loginAdminGoogle();
      nav('/admin');
    } catch (err) {
      setError(err.message);
    }
  }

  function submitPlayer(e) {
    e.preventDefault();
    setError('');
    try {
      loginPlayer(loginId, pin);
      nav('/pairings');
    } catch (err) {
      setError(err.message);
    }
  }

  function submitAdmin(e) {
    e.preventDefault();
    setError('');
    try {
      loginAdmin(pw);
      nav('/admin');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1 className="page-title">로그인</h1>
      <div className="card" style={{ maxWidth: 420 }}>
        <div className="row" style={{ marginBottom: 16 }}>
          <button
            className={`grow ${tab === 'player' ? 'selected' : ''}`}
            onClick={() => setTab('player')}
          >
            참가자
          </button>
          <button
            className={`grow ${tab === 'admin' ? 'selected' : ''}`}
            onClick={() => setTab('admin')}
          >
            운영자
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {tab === 'player' ? (
          <form onSubmit={submitPlayer}>
            <label className="field">
              <span>Chess.com 유저네임 (= 로그인 ID)</span>
              <input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoCapitalize="none" placeholder="예: navi_cat" />
            </label>
            <label className="field">
              <span>숫자 PIN</span>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
              />
            </label>
            <button className="primary" type="submit" style={{ width: '100%' }}>
              참가자 로그인
            </button>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
              데모 데이터의 PIN은 모두 <b>1234</b> 예요. (예: 유저네임 <code>navi_cat</code>)
            </p>
          </form>
        ) : (
          <form onSubmit={submitAdmin}>
            {storeMode === 'firebase' && (
              <>
                <button
                  type="button"
                  onClick={submitGoogle}
                  style={{ width: '100%', marginBottom: 12 }}
                >
                  🔵 Google로 로그인 (운영자)
                </button>
                <div className="muted" style={{ textAlign: 'center', fontSize: '0.8rem', margin: '4px 0 12px' }}>
                  — 또는 비밀번호 —
                </div>
              </>
            )}
            <label className="field">
              <span>운영자 비밀번호</span>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <button className="primary" type="submit" style={{ width: '100%' }}>
              운영자 로그인
            </button>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
              데모 비밀번호: <b>cat1234</b> · 구글 로그인은 firebase 모드에서 동작
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
