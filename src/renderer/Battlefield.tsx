import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import Card from './Card';

import 'tailwindcss/tailwind.css';

const Board = () => {
  return (
    <div className="h-screen w-screen bg-slate-300 relative">
      <Card scryfallId="e8815cd9-7032-445a-aebc-cfc19bd51ee4" />
      <Card scryfallId="20c9c856-af15-40b1-a799-1c2066df2099" />
      <Card scryfallId="d2e1c1c3-641a-4cd5-b46d-e03e5e529cc7" />
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Board />} />
      </Routes>
    </Router>
  );
}
