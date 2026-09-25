// Basic process shim is in index.html

import {StrictMode} from 'react';

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Suppress the specific "already in CLOSING or CLOSED state" error from the browser
// This occurs when audio chunks are sent just as the connection is dropping
window.addEventListener('error', (event) => {
  const message = event.message || (event.error?.message) || '';
  if (message.includes('WebSocket') && (message.includes('CLOSING') || message.includes('CLOSED'))) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  
  // Auto-reload on stale chunk / module script MIME error after new deployment
  if (message.includes('Failed to load module script') || message.includes('MIME type of "text/html"')) {
    const hasRefreshed = sessionStorage.getItem('retry-module-script-refreshed');
    if (!hasRefreshed) {
      sessionStorage.setItem('retry-module-script-refreshed', 'true');
      window.location.reload();
    }
  }
}, true);

// Nuclear Option: Proxy the console to catch and delete the error before it displays
const blockPatterns = [
  'WebSocket is already in CLOSING or CLOSED state',
  'readyState',
  'BidiGenerateContent'
];

const wrapConsole = (type: 'error' | 'warn') => {
  const original = console[type];
  console[type] = (...args: any[]) => {
    const msg = args.join(' ');
    if (blockPatterns.some(p => msg.includes(p))) return;
    original.apply(console, args);
  };
};

if (import.meta.env.PROD) {
  wrapConsole('error');
  wrapConsole('warn');
}

// Global catch for async SDK errors (Uncaught in Promise)
window.addEventListener('unhandledrejection', (event) => {
  const message = event.reason?.message || String(event.reason) || '';
  if (blockPatterns.some(p => message.includes(p))) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

