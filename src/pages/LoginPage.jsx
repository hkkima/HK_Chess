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
        ) : storeMode === 'firebase' ? (
          // 실배포(firebase)에선 구글 화이트리스트 로그인만 허용.
          // 비밀번호 로그인은 소스에 하드코딩돼 공개되므로 노출하지 않는다.
          <div>
            <button
              type="button"
              onClick={submitGoogle}
              className="primary"
              style={{ width: '100%' }}
            >
              🔵 Google로 로그인 (운영자)
            </button>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
              운영자 허용 목록(<code>VITE_ADMIN_EMAILS</code>)에 등록된 구글 계정만 로그인됩니다.
            </p>
          </div>
        ) : (
          // 로컬 개발 모드 폴백: 구글 로그인이 없으므로 비밀번호 로그인 유지.
          <form onSubmit={submitAdmin}>
            <label className="field">
              <span>운영자 비밀번호 (로컬 개발용)</span>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <button className="primary" type="submit" style={{ width: '100%' }}>
              운영자 로그인
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
