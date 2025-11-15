import { useState } from 'react'
import Login from './components/Login'
import Register from './components/Register'
import Dashboard from './components/Dashboard'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('login');
  const [user, setUser] = useState(null);

  const handleLogin = (userData) => {
    if (userData.showRegister) {
      setCurrentView('register');
    } else {
      setUser(userData);
      setCurrentView('dashboard');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentView('login');
  };

  const handleBackToLogin = () => {
    setCurrentView('login');
  };

  return (
    <>
      {currentView === 'login' && <Login onLogin={handleLogin} />}
      {currentView === 'register' && <Register onBack={handleBackToLogin} />}
      {currentView === 'dashboard' && user && <Dashboard user={user} onLogout={handleLogout} />}
    </>
  )
}

export default App
