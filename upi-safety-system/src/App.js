import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import RiskCheck from './pages/RiskCheck';
import RetryPredictor from './pages/RetryPredictor';
import History from './pages/History';
import Recovery from './pages/Recovery';
import Admin from './pages/Admin';
import SpikeWarning from './pages/SpikeWarning';

function App() {
  return (
    <BrowserRouter basename="/">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/risk-check" element={<RiskCheck />} />
        <Route path="/retry-predictor" element={<RetryPredictor />} />
        <Route path="/history" element={<History />} />
        <Route path="/recovery" element={<Recovery />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/spike-warning" element={<SpikeWarning />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;