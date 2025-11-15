import { useState } from 'react';
import { ref, push, get, child } from 'firebase/database';
import { database } from '../firebase';
import './Login.css';

const Register = ({ onBack }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    vehicleType: 'two-wheeler',
    vehicleNumber: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    if (!formData.vehicleNumber.trim()) {
      setError('Vehicle number is required');
      setLoading(false);
      return;
    }

    try {
      // Check if email already exists and get the highest customer ID
      const dbRef = ref(database);
      const snapshot = await get(child(dbRef, 'Tollgate'));
      
      let maxCustomerId = 0;
      
      if (snapshot.exists()) {
        const users = snapshot.val();
        for (let userId in users) {
          if (users[userId].email === formData.email) {
            setError('Email already registered');
            setLoading(false);
            return;
          }
          // Find the highest customer ID
          if (users[userId].customerId) {
            const currentId = parseInt(users[userId].customerId);
            if (currentId > maxCustomerId) {
              maxCustomerId = currentId;
            }
          }
        }
      }

      // Generate new customer ID
      const newCustomerId = String(maxCustomerId + 1).padStart(3, '0');

      // Register new user in Tollgate directory
      const tollgateRef = ref(database, 'Tollgate');
      await push(tollgateRef, {
        customerId: newCustomerId,
        name: formData.name,
        email: formData.email,
        password: formData.password,
        vehicleType: formData.vehicleType,
        vehicleNumber: formData.vehicleNumber.toUpperCase(),
        walletBalance: 0,
        createdAt: new Date().toISOString()
      });

      setSuccess('Registration successful! Redirecting to login...');
      setTimeout(() => {
        onBack();
      }, 2000);
    } catch (err) {
      setError('Registration failed. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>User Registration</h1>
        
        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter your full name"
              required
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label>Vehicle Type</label>
            <select
              name="vehicleType"
              value={formData.vehicleType}
              onChange={handleChange}
              required
            >
              <option value="two-wheeler">Two Wheeler</option>
              <option value="three-wheeler">Three Wheeler</option>
              <option value="four-wheeler">Four Wheeler</option>
            </select>
          </div>

          <div className="form-group">
            <label>Vehicle Number</label>
            <input
              type="text"
              name="vehicleNumber"
              value={formData.vehicleNumber}
              onChange={handleChange}
              placeholder="e.g., TN01AB1234"
              required
              style={{ textTransform: 'uppercase' }}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter your password"
              required
            />
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm your password"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <button type="submit" className="btn-register" disabled={loading}>
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>

        <div className="back-link">
          Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>Login here</a>
        </div>
      </div>
    </div>
  );
};

export default Register;
