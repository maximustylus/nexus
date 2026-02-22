// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getMessaging, getToken } from "firebase/messaging"; // 🛡️ NEW: Messaging imports

// Your web app's Firebase configuration
// (Recovered from your idc-app-e0c59 project settings)
const firebaseConfig = {
  apiKey: "AIzaSyANs4oTfPMmFnALFSFGGCsIfqQMDjqxWK0",
  authDomain: "idc-app-e0c59.firebaseapp.com",
  projectId: "idc-app-e0c59",
  storageBucket: "idc-app-e0c59.firebasestorage.app",
  messagingSenderId: "208388673695",
  appId: "1:208388673695:web:b14ff65a8a9bbc988f12aa",
  measurementId: "G-T465RBWBHJ"
};

// Initialize Firebase Core
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// 🛡️ NEW: Initialize Firebase Cloud Messaging
export const messaging = getMessaging(app);

// 🛡️ NEW: The Handshake Function (Requests permission and gets the device token)
export const requestForToken = async () => {
  try {
    console.log("Requesting notification permission...");
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log("Notification permission granted.");
      
      // Use your Public VAPID Key here to securely subscribe the device
      const currentToken = await getToken(messaging, { 
        vapidKey: 'BNoEmtPUyiZjhqFojcIWBy9srAyyncGz-Y4HuUsURLZbX3B0bT8wa_A5TI9nUDJR2dg2jOrDZbjgoOpQUxlvZU4' 
      });
      
      if (currentToken) {
        console.log('FCM Token generated successfully!');
        return currentToken;
      } else {
        console.log('Failed to generate registration token. Make sure your VAPID key is correct.');
        return null;
      }
    } else {
      console.log('Permission not granted for Notifications.');
      return null;
    }
  } catch (err) {
    console.error('An error occurred while retrieving token: ', err);
    return null;
  }
};
