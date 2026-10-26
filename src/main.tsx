import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Dev only: `?readonly` on the URL blocks every write to Google (see the file).
if (import.meta.env.DEV) {
  const { startReadOnlyGuardIfAsked } = await import('./dev/readOnlyGuard');
  startReadOnlyGuardIfAsked();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
