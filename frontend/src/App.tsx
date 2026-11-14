import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Admin from './pages/Admin';
import Browser from './pages/Browser';
import Home from './pages/Home';
import Mail from './pages/Mail';
import Settings from './pages/Settings';
import Video from './pages/Video';

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/settings/*" element={<Settings />} />
      <Route path="/mail/*" element={<Mail />} />
      <Route path="/video/*" element={<Video />} />
      <Route path="/browser" element={<Browser />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
