// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getDatabase } from "firebase/database";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBi4imuMT5imCT-8IBULdyFqj-ZZtl68Do",
  authDomain: "regal-welder-453313-d6.firebaseapp.com",
  databaseURL: "https://regal-welder-453313-d6-default-rtdb.firebaseio.com",
  projectId: "regal-welder-453313-d6",
  storageBucket: "regal-welder-453313-d6.firebasestorage.app",
  messagingSenderId: "981360128010",
  appId: "1:981360128010:web:5176a72c013f26b8dbeff3",
  measurementId: "G-T67CCEJ8LW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const database = getDatabase(app);

// Telegram Bot Configuration
// Replace these with your actual bot token and chat ID
export const TELEGRAM_BOT_TOKEN = '8485062264:AAH_bkSClz_5ZqqO6FT-uRMkjbvnZlCx38s'; // Get from @BotFather on Telegram
export const TELEGRAM_CHAT_ID = '5795413331'; // Get from @userinfobot on Telegram

export { app, analytics, database };
