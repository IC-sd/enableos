import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AppStoreProvider } from './context/AppStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
import './styles/final-features.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary><AppStoreProvider><App /></AppStoreProvider></ErrorBoundary>
  </React.StrictMode>,
);
