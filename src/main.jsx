import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { NexusProvider } from './context/NexusContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NexusProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </NexusProvider>
  </React.StrictMode>
);
