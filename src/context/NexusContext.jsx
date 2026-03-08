import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase'; // Ensure this points to your firebase config

const NexusContext = createContext();

export const NexusProvider = ({ children }) => {
  const [isDemo, setIsDemo] = useState(false);
  const [userRole, setUserRole] = useState('admin');
  const [auraHistory, setAuraHistory] = useState([]);
  
  // 🛡️ NEW: Global User State
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          // Fetch the user's extended profile from Firestore
          const userDocRef = doc(db, 'users', authUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          let firestoreData = {};
          if (userDocSnap.exists()) {
            firestoreData = userDocSnap.data();
          }

          // Merge Auth data with Firestore data
          setUser({
            id: authUser.uid,
            email: authUser.email,
            displayName: authUser.displayName, // From Google Auth
            name: firestoreData.name || authUser.displayName, // From Firestore
            title: firestoreData.title || 'Staff', // e.g., Clinical Exercise Physiologist
            department: firestoreData.department || 'KKH',
            ...firestoreData
          });
        } catch (error) {
          console.error("Error fetching user profile:", error);
          // Fallback if Firestore fails but Auth succeeds
          setUser({
            id: authUser.uid,
            email: authUser.email,
            displayName: authUser.displayName,
            name: authUser.displayName
          });
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  const toggleDemo = () => {
    setIsDemo(prev => !prev);
    if (!isDemo) setUserRole('admin'); 
  };

  return (
    <NexusContext.Provider value={{ 
        isDemo, 
        toggleDemo, 
        userRole, 
        setUserRole,
        auraHistory,     
        setAuraHistory,
        user,           // Export the active user globally
        authLoading     // Export loading state so UI doesn't flash
    }}>
      {!authLoading && children}
    </NexusContext.Provider>
  );
};

export const useNexus = () => useContext(NexusContext);
