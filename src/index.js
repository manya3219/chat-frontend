import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  // StrictMode disabled to prevent double renders in development
  // Enable for debugging: <React.StrictMode><App /></React.StrictMode>
  <App />
);
