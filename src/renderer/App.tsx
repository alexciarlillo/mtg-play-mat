import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import 'tailwindcss/tailwind.css';
import icon from '../../assets/icon.svg';

const Hello = () => {
  return (
    <div className="text-sm text-center font-medium text-red-500">
      Hello from tailwind
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Hello />} />
      </Routes>
    </Router>
  );
}
