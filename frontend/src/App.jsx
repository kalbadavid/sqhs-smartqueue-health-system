import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Registration from './pages/Registration';
import Triage from './pages/Triage';

export default function App() {
  return (
    <div className="min-h-screen flex bg-bone-50 text-ink-800">
      <Sidebar />
      <main className="flex-1 min-w-0 px-8 py-7 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/register" element={<Registration />} />
          <Route path="/triage" element={<Triage />} />
        </Routes>
      </main>
    </div>
  );
}
