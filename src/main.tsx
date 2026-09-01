import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { AuthProvider } from '@/auth/AuthContext';
import { StoreProvider } from '@/state/store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </AuthProvider>
  </StrictMode>,
);
