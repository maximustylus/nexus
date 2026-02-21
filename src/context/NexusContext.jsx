import React, { createContext, useContext, useState, useEffect } from 'react';

const NexusContext = createContext();

export const NexusProvider = ({ children }) => {
  // Default to false for Production, but you can toggle this via a hidden UI trigger
  const [isDemo, setIsDemo] = useState(false);
  const [userRole, setUserRole] = useState('admin');
  
  const toggleDemo = () => {
    setIsDemo(prev => !prev);
    // When switching to Demo, force the user to be a 'Lead' to show off Admin features
    if (!isDemo) setUserRole('admin'); 
  };

  return (
    <NexusContext.Provider value={{ isDemo, toggleDemo, userRole, setUserRole }}>
      {children}
    </NexusContext.Provider>
  );
};

export const useNexus = () => useContext(NexusContext);
