import { useState, useEffect } from 'react';
import { ref, get, child, update, onValue } from 'firebase/database';
import { database, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../firebase';
import './Dashboard.css';

const Dashboard = ({ user, onLogout }) => {
  const [walletBalance, setWalletBalance] = useState(0);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [entryStatus, setEntryStatus] = useState('');
  const [servoStatus, setServoStatus] = useState(0);
  const [travelStartTime, setTravelStartTime] = useState(null);
  const [travelDuration, setTravelDuration] = useState(0);
  const [tollAmount, setTollAmount] = useState(0);
  const [showTollDeduction, setShowTollDeduction] = useState(false);
  const [isProcessingToll, setIsProcessingToll] = useState(false);
  const [lastProcessedEntry, setLastProcessedEntry] = useState('');
  const [totalCollected, setTotalCollected] = useState(0);
  const [gateCollections, setGateCollections] = useState({
    IR1: 0,
    IR2: 0,
    IR3: 0,
    IR4: 0
  });
  const [dailyCollections, setDailyCollections] = useState([]);
  const [vehicleTypeData, setVehicleTypeData] = useState({
    'Two Wheeler': 0,
    'Three Wheeler': 0,
    'Four Wheeler': 0
  });

  // Function to send Telegram notification
  const sendTelegramNotification = async (message) => {
    console.log('🔔 Attempting to send Telegram notification...');
    console.log('Bot Token:', TELEGRAM_BOT_TOKEN);
    console.log('Chat ID:', TELEGRAM_CHAT_ID);
    console.log('Message:', message);
    
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      console.log('Telegram API URL:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML'
        })
      });
      
      const data = await response.json();
      console.log('Telegram API Response:', data);
      
      if (data.ok) {
        console.log('✅ Telegram notification sent successfully!');
      } else {
        console.error('❌ Telegram notification failed:', data);
        alert(`Telegram Error: ${data.description || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error sending Telegram notification:', error);
      alert(`Network Error: ${error.message}`);
    }
  };

  // Monitor Entry field for IR sensor changes
  useEffect(() => {
    if (user.type === 'user') {
      const tollgateRef = ref(database, 'Tollgate');
      
      const unsubscribe = onValue(tollgateRef, async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const entry = data.Entry || '';
          const servo = data.Servo || 0;
          
          setEntryStatus(entry);
          setServoStatus(servo);
          
          // Check if Entry is IR1, IR2, IR3, or IR4 and not already processing
          if (['IR1', 'IR2', 'IR3', 'IR4'].includes(entry) && !isProcessingToll && entry !== lastProcessedEntry) {
            setIsProcessingToll(true);
            setLastProcessedEntry(entry);
            
            // If this is the first IR sensor trigger, start tracking time
            if (!travelStartTime) {
              setTravelStartTime(Date.now());
            }
            
            // First, check user's wallet balance
            const dbRef = ref(database);
            const userSnapshot = await get(child(dbRef, 'Tollgate'));
            
            if (userSnapshot.exists()) {
              const users = userSnapshot.val();
              let currentBalance = 0;
              let currentUserId = null;
              let vehicleType = 'two-wheeler'; // default
              
              for (let userId in users) {
                if (users[userId].email === user.email) {
                  currentBalance = users[userId].walletBalance || 0;
                  currentUserId = userId;
                  vehicleType = users[userId].vehicleType || 'two-wheeler';
                  break;
                }
              }
              
              // Determine base rate based on vehicle type
              let baseRate = 10; // default for two-wheeler
              switch(vehicleType) {
                case 'two-wheeler':
                  baseRate = 10;
                  break;
                case 'three-wheeler':
                  baseRate = 15;
                  break;
                case 'four-wheeler':
                  baseRate = 20;
                  break;
              }
              
              // Determine duration and toll based on entry sensor and vehicle type
              let duration = 10; // default
              let distance = 1; // default in km
              let calculatedToll = 0; // default - IR1 is free
              
              switch(entry) {
                case 'IR1':
                  duration = 10;
                  distance = 1;
                  calculatedToll = 0; // No toll for IR1
                  break;
                case 'IR2':
                  duration = 15;
                  distance = 1.5;
                  calculatedToll = baseRate * 1.5;
                  break;
                case 'IR3':
                  duration = 20;
                  distance = 2;
                  calculatedToll = baseRate * 2;
                  break;
                case 'IR4':
                  duration = 30;
                  distance = 3;
                  calculatedToll = baseRate * 3;
                  break;
              }
              
              setTravelDuration(duration);
              setTollAmount(calculatedToll);
              
              // Only check balance for IR1 (entry gate)
              if (entry === 'IR1') {
                // Check if user has minimum balance (>= ₹80) for IR1
                if (currentBalance < 80) {
                  // Insufficient balance - FORCE servo to 0 for IR1
                  await update(ref(database, 'Tollgate'), {
                    Servo: 0,
                    Entry: entry
                  });
                  
                  setAlertMessage('Cannot open gate! Minimum balance required is ₹80. Please recharge.');
                  setShowAlert(true);
                  setTravelStartTime(null);
                  setIsProcessingToll(false);
                  
                  // Reset after showing message
                  setTimeout(() => {
                    setShowAlert(false);
                    setLastProcessedEntry('');
                  }, 5000);
                } else {
                  // IR1 - Free entry, open gate (balance >= ₹80)
                  await update(ref(database, 'Tollgate'), {
                    Servo: 1
                  });
                  
                  // After specified duration, set Servo back to 0
                setTimeout(async () => {
                  await update(ref(database, 'Tollgate'), {
                    Servo: 0
                  });
                  
                  // IR1 is free - just track vehicle passage
                  if (currentUserId) {
                    const gateNumber = entry.replace('IR', '');
                    const userSnapshot = await get(ref(database, `Tollgate/${currentUserId}`));
                    const userData = userSnapshot.val();
                    const customerId = userData?.customerId || 'N/A';
                    const vehicleType = userData?.vehicleType || 'N/A';
                    const vehicleNumber = userData?.vehicleNumber || 'N/A';
                    
                    const currentTime = new Date().toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      hour12: true,
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    });
                    
                    const telegramMessage = `🚗 <b>Vehicle Passed Through Tollgate</b>\n\n` +
                      `📋 Customer ID: ${customerId}\n` +
                      `🚪 Gate: Gate ${gateNumber} (FREE ENTRY)\n` +
                      `🚙 Vehicle Type: ${vehicleType}\n` +
                      `🔢 Vehicle Number: ${vehicleNumber}\n` +
                      `💰 Toll Amount: FREE\n` +
                      `💳 Wallet Balance: ₹${currentBalance.toFixed(2)}\n` +
                      `🕐 Time: ${currentTime}`;
                    
                    sendTelegramNotification(telegramMessage);
                    
                    // Track vehicle type passage for pie chart
                    const formattedVehicleType = vehicleType
                      .split('-')
                      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(' ');
                    
                    const vehiclePassagesRef = ref(database, 'vehiclePassages');
                    const passageSnapshot = await get(vehiclePassagesRef);
                    const passageData = passageSnapshot.val() || {};
                    const currentCount = passageData[formattedVehicleType] || 0;
                    
                    await update(ref(database), {
                      [`vehiclePassages/${formattedVehicleType}`]: currentCount + 1
                    });
                  }
                  
                  // Hide message after 5 seconds
                  setTimeout(() => {
                    setShowTollDeduction(false);
                    setTravelStartTime(null);
                    setTravelDuration(0);
                    setTollAmount(0);
                    setIsProcessingToll(false);
                  }, 5000);
                }, duration * 1000);
                }
              } else if (entry === 'IR2' || entry === 'IR3' || entry === 'IR4') {
                // IR2/IR3/IR4 - Keep servo at 0, always deduct toll (no balance check)
                await update(ref(database, 'Tollgate'), {
                  Servo: 0
                });
                
                // Always deduct toll for IR2/IR3/IR4 regardless of balance
                if (currentUserId) {
                  // Deduct toll without opening gate
                  const newBalance = currentBalance - calculatedToll;
                  
                  // Update wallet balance and total collected
                  const currentTotalRef = ref(database, 'Tollgate');
                  const totalSnapshot = await get(currentTotalRef);
                  const currentTotal = totalSnapshot.val()?.totalCollected || 0;
                  
                  // Get today's date
                  const today = new Date().toISOString().split('T')[0];
                  const dailyCollections = totalSnapshot.val()?.dailyCollections || {};
                  const todayCollection = dailyCollections[today] || 0;
                  
                  await update(ref(database, `Tollgate/${currentUserId}`), {
                    walletBalance: newBalance
                  });
                  
                  // Update total collected and gate-specific collection
                  const gateKey = `${entry}Collected`;
                  const currentGateTotal = totalSnapshot.val()?.[gateKey] || 0;
                  
                  await update(ref(database, 'Tollgate'), {
                    totalCollected: currentTotal + calculatedToll,
                    [gateKey]: currentGateTotal + calculatedToll,
                    [`dailyCollections/${today}`]: todayCollection + calculatedToll
                  });
                  
                  setWalletBalance(newBalance);
                  setShowTollDeduction(true);

                  // Send Telegram notification
                  const gateNumber = entry.replace('IR', '');
                  const userSnapshot = await get(ref(database, `Tollgate/${currentUserId}`));
                  const userData = userSnapshot.val();
                  const customerId = userData?.customerId || 'N/A';
                  const vehicleType = userData?.vehicleType || 'N/A';
                  const vehicleNumber = userData?.vehicleNumber || 'N/A';
                  
                  const currentTime = new Date().toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    hour12: true,
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  });
                  
                  const telegramMessage = `🚗 <b>Vehicle Passed Through Tollgate</b>\n\n` +
                    `📋 Customer ID: ${customerId}\n` +
                    `🚪 Gate: Gate ${gateNumber} (SERVO = 0)\n` +
                    `🚙 Vehicle Type: ${vehicleType}\n` +
                    `🔢 Vehicle Number: ${vehicleNumber}\n` +
                    `💰 Toll Amount: ₹${calculatedToll}\n` +
                    `💳 Remaining Balance: ₹${newBalance.toFixed(2)}\n` +
                    `🕐 Time: ${currentTime}`;
                  
                  sendTelegramNotification(telegramMessage);
                  
                  // Track vehicle type passage for pie chart
                  const formattedVehicleType = vehicleType
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                  
                  const vehiclePassagesRef = ref(database, 'vehiclePassages');
                  const passageSnapshot = await get(vehiclePassagesRef);
                  const passageData = passageSnapshot.val() || {};
                  const currentCount = passageData[formattedVehicleType] || 0;
                  
                  await update(ref(database), {
                    [`vehiclePassages/${formattedVehicleType}`]: currentCount + 1
                  });
                    
                  // Hide message after 5 seconds
                  setTimeout(() => {
                    setShowTollDeduction(false);
                    setTravelStartTime(null);
                    setTravelDuration(0);
                    setTollAmount(0);
                    setIsProcessingToll(false);
                  }, 5000);
                }
              }
            }
          }
        }
      });

      return () => unsubscribe();
    }
  }, [user, isProcessingToll, lastProcessedEntry, travelStartTime]);

  // Monitor Entry and Servo for admin dashboard
  useEffect(() => {
    if (user.type === 'admin') {
      const tollgateRef = ref(database);
      
      const unsubscribe = onValue(tollgateRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const tollgateData = data.Tollgate || {};
          const entry = tollgateData.Entry || '';
          const servo = tollgateData.Servo || 0;
          const total = tollgateData.totalCollected || 0;
          
          setEntryStatus(entry);
          setServoStatus(servo);
          setTotalCollected(total);
          
          // Update gate-specific collections
          setGateCollections({
            IR1: tollgateData.IR1Collected || 0,
            IR2: tollgateData.IR2Collected || 0,
            IR3: tollgateData.IR3Collected || 0,
            IR4: tollgateData.IR4Collected || 0
          });
          
          // Update daily collections for chart
          const daily = tollgateData.dailyCollections || {};
          const dailyData = Object.keys(daily).map(date => ({
            date,
            amount: daily[date]
          })).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-7); // Last 7 days
          setDailyCollections(dailyData);
          
          // Update vehicle type data for pie chart
          const vehiclePassages = data.vehiclePassages || {};
          console.log('Vehicle Passages from Firebase:', vehiclePassages);
          setVehicleTypeData({
            'Two Wheeler': vehiclePassages['Two Wheeler'] || 0,
            'Three Wheeler': vehiclePassages['Three Wheeler'] || 0,
            'Four Wheeler': vehiclePassages['Four Wheeler'] || 0
          });
        }
      });

      return () => unsubscribe();
    }
  }, [user]);

  // Fetch wallet balance on component mount
  useEffect(() => {
    if (user.type === 'user') {
      fetchWalletBalance();
    } else if (user.type === 'admin') {
      fetchAllUsers();
    }
  }, [user]);

  // Check if balance is below 80
  useEffect(() => {
    if (walletBalance < 80 && walletBalance >= 0) {
      setAlertMessage('Insufficient balance! Minimum balance required is ₹80');
      setShowAlert(true);
    } else {
      setShowAlert(false);
    }
  }, [walletBalance]);

  const fetchWalletBalance = async () => {
    try {
      const dbRef = ref(database);
      const snapshot = await get(child(dbRef, 'Tollgate'));
      
      if (snapshot.exists()) {
        const users = snapshot.val();
        for (let userId in users) {
          if (users[userId].email === user.email) {
            setWalletBalance(users[userId].walletBalance || 0);
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const dbRef = ref(database);
      const snapshot = await get(child(dbRef, 'Tollgate'));
      
      if (snapshot.exists()) {
        const users = snapshot.val();
        const usersList = [];
        
        for (let userId in users) {
          const userData = users[userId];
          usersList.push({
            id: userId,
            customerId: userData.customerId,
            name: userData.name,
            email: userData.email,
            vehicleType: userData.vehicleType,
            vehicleNumber: userData.vehicleNumber,
            walletBalance: userData.walletBalance || 0,
            createdAt: userData.createdAt
          });
        }
        
        setAllUsers(usersList);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleRechargeClick = () => {
    setShowRechargeModal(true);
    setRechargeAmount('');
  };

  const handleAddAmount = async () => {
    const amount = parseFloat(rechargeAmount);
    
    if (!amount || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    setIsProcessing(true);

    // Simulate processing for 3 seconds
    setTimeout(async () => {
      try {
        const dbRef = ref(database);
        const snapshot = await get(child(dbRef, 'Tollgate'));
        
        if (snapshot.exists()) {
          const users = snapshot.val();
          for (let userId in users) {
            if (users[userId].email === user.email) {
              const currentBalance = users[userId].walletBalance || 0;
              const newBalance = currentBalance + amount;
              
              // Update wallet balance in Firebase
              const userRef = ref(database, `Tollgate/${userId}`);
              await update(userRef, {
                walletBalance: newBalance
              });
              
              setWalletBalance(newBalance);
              break;
            }
          }
        }

        setIsProcessing(false);
        setShowSuccess(true);
        
        // Hide success message and modal after 2 seconds
        setTimeout(() => {
          setShowSuccess(false);
          setShowRechargeModal(false);
          setRechargeAmount('');
        }, 2000);
        
      } catch (error) {
        console.error('Error updating wallet:', error);
        setIsProcessing(false);
        alert('Failed to update wallet. Please try again.');
      }
    }, 3000);
  };

  // Test Telegram notification
  const testTelegramNotification = async () => {
    // Try without HTML first
    const simpleMessage = `Test Notification\n\nThis is a test message from your Tollgate System!\n\nIf you receive this, your Telegram bot is working correctly.`;
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: simpleMessage
        })
      });
      
      const data = await response.json();
      console.log('Simple message response:', data);
      
      if (!data.ok) {
        alert(`Error: ${data.description}`);
      } else {
        alert('Message sent! Check your Telegram bot chat.');
      }
    } catch (error) {
      console.error('Error:', error);
      alert(`Error: ${error.message}`);
    }
  };

  // Get updates to find correct chat ID
  const getUpdates = async () => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`);
      const data = await response.json();
      console.log('📬 Telegram Updates:', data);
      
      // Also get bot info
      const botResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
      const botData = await botResponse.json();
      console.log('🤖 Bot Info:', botData);
      
      if (botData.ok) {
        const botUsername = botData.result.username;
        alert(`Your bot username is: @${botUsername}\n\nOpen Telegram and search for @${botUsername}\nThen send /start to it!\n\nBot link: https://t.me/${botUsername}`);
      }
      
      if (data.ok && data.result.length > 0) {
        const latestUpdate = data.result[data.result.length - 1];
        const chatId = latestUpdate.message?.chat?.id || latestUpdate.my_chat_member?.chat?.id;
        console.log('✅ Your Chat ID is:', chatId);
        alert(`Your Chat ID is: ${chatId}\n\nCurrent Chat ID in config: ${TELEGRAM_CHAT_ID}`);
      } else {
        console.log('No recent messages found');
      }
    } catch (error) {
      console.error('Error getting updates:', error);
    }
  };

  return (
    <div className="dashboard-container">
      <nav className="navbar">
        <h2>Tollgate System</h2>
        <div className="user-info">
          <span>{user.type === 'admin' ? 'Admin' : user.name}</span>
          <button onClick={onLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="welcome-card">
          <h1>Welcome, {user.type === 'admin' ? 'Admin' : user.name}!</h1>
          <p>You are logged in as {user.type === 'admin' ? 'an Administrator' : 'a User'}.</p>
          
          {user.type === 'user' && (
            <div className="user-details">
              <h3>Complete User Information</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Customer ID:</span>
                  <span className="info-value">{user.customerId}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Full Name:</span>
                  <span className="info-value">{user.name}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Email:</span>
                  <span className="info-value">{user.email}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Vehicle Type:</span>
                  <span className="info-value" style={{ textTransform: 'capitalize' }}>
                    {user.vehicleType?.replace('-', ' ') || 'Not specified'}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Account Created:</span>
                  <span className="info-value">{new Date(user.createdAt).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Role:</span>
                  <span className="info-value">User</span>
                </div>
              </div>
            </div>
          )}

          {user.type === 'admin' && (
            <div className="user-details">
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Role:</strong> Administrator</p>
            </div>
          )}
        </div>

        {user.type === 'admin' ? (
          <div className="admin-panel">
            <h2>Admin Panel</h2>
            
            {/* Toll Gate Status for Admin */}
            <div className="entry-status-section">
              <h3>Toll Gate Status</h3>
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">Current Entry:</span>
                  <span className={`status-value ${['IR1', 'IR2', 'IR3', 'IR4'].includes(entryStatus) ? 'active' : ''}`}>
                    {entryStatus || 'No Entry'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Gate Status:</span>
                  <span className={`status-value ${servoStatus === 1 ? 'open' : 'closed'}`}>
                    {servoStatus === 1 ? 'OPEN' : 'CLOSED'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Total Collected:</span>
                  <span className="status-value" style={{ color: '#4caf50' }}>
                    ₹{totalCollected.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Daily Collections Bar Chart */}
            <div className="chart-section">
              <h3>Daily Collections (Last 7 Days)</h3>
              <div className="bar-chart">
                <div className="chart-grid">
                  {dailyCollections.length > 0 ? (
                    dailyCollections.map((day, index) => {
                      const maxAmount = Math.max(...dailyCollections.map(d => d.amount), 100);
                      const barHeight = (day.amount / maxAmount) * 100;
                      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'];
                      
                      return (
                        <div key={index} className="bar-container">
                          <div className="bar-value">₹{day.amount.toFixed(0)}</div>
                          <div className="bar-wrapper">
                            <div 
                              className="bar" 
                              style={{ 
                                height: `${barHeight}%`,
                                backgroundColor: colors[index % colors.length]
                              }}
                            ></div>
                          </div>
                          <div className="bar-label">
                            {new Date(day.date).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="no-data-message">No collection data available yet</div>
                  )}
                </div>
              </div>
            </div>

            <p>Total Registered Users: {allUsers.length}</p>
            
            {/* Gate Collections */}
            <div className="gate-collections-section">
              <h3>Collections by Gate</h3>
              <div className="gate-collections-grid">
                <div className="gate-collection-card">
                  <div className="gate-icon">1</div>
                  <div className="gate-info">
                    <span className="gate-label">Gate 1</span>
                    <span className="gate-amount">₹{gateCollections.IR1.toFixed(2)}</span>
                  </div>
                </div>
                <div className="gate-collection-card">
                  <div className="gate-icon">2</div>
                  <div className="gate-info">
                    <span className="gate-label">Gate 2</span>
                    <span className="gate-amount">₹{gateCollections.IR2.toFixed(2)}</span>
                  </div>
                </div>
                <div className="gate-collection-card">
                  <div className="gate-icon">3</div>
                  <div className="gate-info">
                    <span className="gate-label">Gate 3</span>
                    <span className="gate-amount">₹{gateCollections.IR3.toFixed(2)}</span>
                  </div>
                </div>
                <div className="gate-collection-card">
                  <div className="gate-icon">4</div>
                  <div className="gate-info">
                    <span className="gate-label">Gate 4</span>
                    <span className="gate-amount">₹{gateCollections.IR4.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Vehicle Type Distribution Pie Chart */}
            <div className="chart-section">
              <h3>Vehicle Type Distribution (All Gates)</h3>
              <div className="pie-chart-container">
                {(() => {
                  const totalVehicles = Object.values(vehicleTypeData).reduce((sum, count) => sum + count, 0);
                  
                  if (totalVehicles === 0) {
                    return <div className="no-data-message">No vehicle passage data available yet</div>;
                  }
                  
                  const colors = {
                    'Two Wheeler': '#FF6B6B',
                    'Three Wheeler': '#4ECDC4',
                    'Four Wheeler': '#45B7D1'
                  };
                  
                  let currentAngle = 0;
                  
                  return (
                    <>
                      <div className="pie-chart-wrapper">
                        <svg viewBox="0 0 200 200" className="pie-chart-svg">
                          {Object.entries(vehicleTypeData).map(([type, count]) => {
                            if (count === 0) return null;
                            
                            const percentage = (count / totalVehicles) * 100;
                            const angle = (percentage / 100) * 360;
                            const startAngle = currentAngle;
                            const endAngle = currentAngle + angle;
                            
                            // Calculate path for pie slice
                            const startX = 100 + 90 * Math.cos((Math.PI * startAngle) / 180);
                            const startY = 100 + 90 * Math.sin((Math.PI * startAngle) / 180);
                            const endX = 100 + 90 * Math.cos((Math.PI * endAngle) / 180);
                            const endY = 100 + 90 * Math.sin((Math.PI * endAngle) / 180);
                            const largeArc = angle > 180 ? 1 : 0;
                            
                            const pathData = [
                              `M 100 100`,
                              `L ${startX} ${startY}`,
                              `A 90 90 0 ${largeArc} 1 ${endX} ${endY}`,
                              `Z`
                            ].join(' ');
                            
                            currentAngle = endAngle;
                            
                            return (
                              <path
                                key={type}
                                d={pathData}
                                fill={colors[type]}
                                stroke="white"
                                strokeWidth="2"
                              />
                            );
                          })}
                        </svg>
                        <div className="pie-chart-center">
                          <div className="pie-total">{totalVehicles}</div>
                          <div className="pie-label">Total</div>
                        </div>
                      </div>
                      
                      <div className="pie-chart-legend">
                        {Object.entries(vehicleTypeData).map(([type, count]) => {
                          if (count === 0) return null;
                          const percentage = ((count / totalVehicles) * 100).toFixed(1);
                          return (
                            <div key={type} className="legend-item">
                              <div className="legend-color" style={{ backgroundColor: colors[type] }}></div>
                              <div className="legend-info">
                                <span className="legend-type">{type}</span>
                                <span className="legend-stats">{count} ({percentage}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            
            {/* Low Balance Alerts */}
            {allUsers.filter(u => u.walletBalance < 80).length > 0 && (
              <div className="admin-alerts">
                <h3>⚠️ Low Balance Alerts</h3>
                <div className="alerts-list">
                  {allUsers
                    .filter(u => u.walletBalance < 80)
                    .map(u => (
                      <div key={u.id} className="alert-item">
                        <strong>{u.name}</strong> (ID: {u.customerId}) - 
                        Insufficient Balance: ₹{u.walletBalance.toFixed(2)}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Users Table */}
            <div className="users-table-container">
              <h3>Registered Users</h3>
              {allUsers.length > 0 ? (
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Customer ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Vehicle Type</th>
                      <th>Vehicle Number</th>
                      <th>Wallet Balance</th>
                      <th>Registration Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers.map(user => (
                      <tr key={user.id} className={user.walletBalance < 80 ? 'low-balance-row' : ''}>
                        <td>{user.customerId}</td>
                        <td>{user.name}</td>
                        <td>{user.email}</td>
                        <td style={{ textTransform: 'capitalize' }}>
                          {user.vehicleType?.replace('-', ' ') || 'N/A'}
                        </td>
                        <td style={{ fontWeight: '600', color: '#667eea' }}>
                          {user.vehicleNumber || 'N/A'}
                        </td>
                        <td className={user.walletBalance < 80 ? 'balance-warning' : 'balance-ok'}>
                          ₹{user.walletBalance.toFixed(2)}
                        </td>
                        <td>{new Date(user.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}</td>
                        <td>
                          {user.walletBalance < 80 ? (
                            <span className="status-badge insufficient">Insufficient Balance</span>
                          ) : (
                            <span className="status-badge active">Active</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ textAlign: 'center', color: '#999', marginTop: '20px' }}>
                  No users registered yet.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="user-panel">
            <h2>User Dashboard</h2>
            
            {/* Entry Status Display */}
            <div className="entry-status-section">
              <h3>Toll Gate Status</h3>
              {showAlert && (
                <div className="gate-alert-message">
                  ⚠️ {alertMessage}
                </div>
              )}
              {showTollDeduction && (
                <div className="toll-deduction-message">
                  {tollAmount === 0 ? (
                    <>✓ FREE ENTRY - No toll charged | Gate: {entryStatus} | Location: {(13 + Math.random() * 2).toFixed(6)}°N, {(77 + Math.random() * 3).toFixed(6)}°E</>
                  ) : (
                    <>✓ Toll Deducted: ₹{tollAmount.toFixed(2)} | Distance: {(travelDuration / 10).toFixed(1)} km | Location: {(13 + Math.random() * 2).toFixed(6)}°N, {(77 + Math.random() * 3).toFixed(6)}°E</>
                  )}
                </div>
              )}
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">Current Entry:</span>
                  <span className={`status-value ${entryStatus === 'IR1' ? 'active' : ''}`}>
                    {entryStatus === 'IR1' ? 'IR1' : 'No Entry'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Current Exit:</span>
                  <span className={`status-value ${['IR2', 'IR3', 'IR4'].includes(entryStatus) ? 'active' : ''}`}>
                    {['IR2', 'IR3', 'IR4'].includes(entryStatus) ? entryStatus : 'No Exit'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Gate Status:</span>
                  <span className={`status-value ${servoStatus === 1 ? 'open' : 'closed'}`}>
                    {servoStatus === 1 ? 'OPEN' : 'CLOSED'}
                  </span>
                </div>
              </div>
            </div>

            {/* Wallet Section */}
            <div className="wallet-section">
              <div className="wallet-header">
                <div>
                  <h3>Wallet Balance</h3>
                  <p className={`balance-amount ${walletBalance < 30 ? 'low-balance' : ''}`}>
                    ₹{walletBalance.toFixed(2)}
                  </p>
                  {showAlert && (
                    <p className="alert-message">{alertMessage}</p>
                  )}
                </div>
                <button className="btn-recharge" onClick={handleRechargeClick}>
                  Recharge Wallet
                </button>
                <button 
                  className="btn-recharge" 
                  onClick={testTelegramNotification}
                  style={{ marginTop: '10px', backgroundColor: '#25D366' }}
                >
                  🔔 Test Telegram Alert
                </button>
                <button 
                  className="btn-recharge" 
                  onClick={getUpdates}
                  style={{ marginTop: '10px', backgroundColor: '#0088cc' }}
                >
                  📬 Get My Chat ID
                </button>
              </div>
            </div>

            <p style={{ marginTop: '20px', color: '#666' }}>Other features coming soon...</p>
          </div>
        )}
      </div>

      {/* Recharge Modal */}
      {showRechargeModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            {isProcessing ? (
              <div className="processing-screen">
                <div className="loader"></div>
                <p>Processing Payment...</p>
              </div>
            ) : showSuccess ? (
              <div className="success-screen">
                <div className="success-icon">✓</div>
                <h3>Payment Completed!</h3>
                <p>Your wallet has been recharged successfully.</p>
              </div>
            ) : (
              <>
                <h2>Recharge Wallet</h2>
                <div className="recharge-form">
                  <label>Enter Amount (₹)</label>
                  <input
                    type="number"
                    value={rechargeAmount}
                    onChange={(e) => setRechargeAmount(e.target.value)}
                    placeholder="Enter amount to recharge"
                    min="1"
                    step="0.01"
                  />
                  <div className="modal-actions">
                    <button className="btn-add" onClick={handleAddAmount}>
                      Add Amount
                    </button>
                    <button className="btn-cancel" onClick={() => setShowRechargeModal(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
