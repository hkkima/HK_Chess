import { NavLink } from 'react-router-dom';
import { useApp } from '../state/AppContext.jsx';

export default function Nav() {
  const { user, logout } = useApp();
  return (
    <nav className="nav">
      <div className="nav-inner">
        <span className="nav-brand">♟️ 체스 토너먼트</span>
        <NavLink to="/" end>
          순위표
        </NavLink>
        <NavLink to="/pairings">대진표</NavLink>
        <NavLink to="/bracket">브래킷</NavLink>
        <NavLink to="/register">등록</NavLink>
        <NavLink to="/submit">결과제출</NavLink>
        <NavLink to="/admin">운영자</NavLink>
        <span className="nav-spacer" />
        <span className="nav-user">
          {user ? (
            <>
              <span>{user.type === 'admin' ? '👑 운영자' : `🐾 ${user.name}`}</span>
              <button className="ghost" onClick={logout} style={{ padding: '4px 10px' }}>
                로그아웃
              </button>
            </>
          ) : (
            <NavLink to="/login">로그인</NavLink>
          )}
        </span>
      </div>
    </nav>
  );
}
