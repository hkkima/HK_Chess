import { Routes, Route } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import StandingsPage from './pages/StandingsPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import PairingsPage from './pages/PairingsPage.jsx';
import BracketPage from './pages/BracketPage.jsx';
import SubmitResultPage from './pages/SubmitResultPage.jsx';
import AdminPanel from './pages/AdminPanel.jsx';
import LoginPage from './pages/LoginPage.jsx';

export default function App() {
  return (
    <>
      <Nav />
      <main className="app-shell">
        <Routes>
          <Route path="/" element={<StandingsPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/pairings" element={<PairingsPage />} />
          <Route path="/bracket" element={<BracketPage />} />
          <Route path="/submit" element={<SubmitResultPage />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<StandingsPage />} />
        </Routes>
      </main>
    </>
  );
}
