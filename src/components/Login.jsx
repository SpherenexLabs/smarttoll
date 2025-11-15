import { useState } from 'react';
import { ref, get, child } from 'firebase/database';
import { database } from '../firebase';
import './Login.css';

const Login = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (activeTab === 'admin') {
        // Admin login
        if (email === 'admin@gmail.com' && password === 'admin123') {
          onLogin({ type: 'admin', email: 'admin@gmail.com' });
        } else {
          setError('Invalid admin credentials');
        }
      } else {
        // User login
        const dbRef = ref(database);
        const snapshot = await get(child(dbRef, 'Tollgate'));
        
        if (snapshot.exists()) {
          const users = snapshot.val();
          let userFound = false;

          for (let userId in users) {
            const user = users[userId];
            if (user.email === email && user.password === password) {
              userFound = true;
              onLogin({ 
                type: 'user', 
                email: user.email, 
                name: user.name,
                customerId: user.customerId,
                vehicleType: user.vehicleType,
                createdAt: user.createdAt
              });
              break;
            }
          }

          if (!userFound) {
            setError('Invalid email or password');
          }
        } else {
          setError('No users found. Please register first.');
        }
      }
    } catch (err) {
      setError('Login failed. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Tollgate System</h1>
        
        <div className="tabs">
          <button 
            className={activeTab === 'user' ? 'active' : ''} 
            onClick={() => setActiveTab('user')}
          >
            User Login
          </button>
          <button 
            className={activeTab === 'admin' ? 'active' : ''} 
            onClick={() => setActiveTab('admin')}
          >
            Admin Login
          </button>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {activeTab === 'user' && (
          <div className="register-link">
            Don't have an account? <a href="#" onClick={(e) => { e.preventDefault(); onLogin({ showRegister: true }); }}>Register here</a>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
