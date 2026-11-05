import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { AdventurerProvider } from './lib/adventurer';
import { applyPrefs } from './lib/storage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { reportClientError } from './lib/track';
import './lib/install'; // starts listening for the browser's install prompt before the app mounts

applyPrefs();
const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });

window.addEventListener('error', (e) => reportClientError(e.message || 'Script error'));
window.addEventListener('unhandledrejection', (e) => reportClientError(`Unhandled: ${(e.reason as Error | undefined)?.message ?? String(e.reason)}`));

// Lets phones install the site and shows an offline page when there is no connection (see public/sw.js). Production only.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined); });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <AdventurerProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <App />
            </BrowserRouter>
          </AdventurerProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
