
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  const msg = "Could not find root element to mount to";
  console.error(msg);
} else {
  const root = createRoot(rootElement);
  
  try {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (err) {
    console.error('Immediate error rendering app:', err);
    rootElement.innerHTML = `<div style="color: white; padding: 20px; background: red;">Error crítico al iniciar: ${err}</div>`;
  }
}
