import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { queryClient } from './lib/queries';
import { AuthProvider } from './providers/auth';
import { ThemeProvider } from './providers/theme';
import { ToastProvider } from './providers/toast';
import { CartProvider } from './providers/cart';
import { registerServiceWorker } from './lib/pwa';
import './styles/index.css';

/**
 * Provider order matters: theme first so the very first paint is correct,
 * then query, then auth (which issues a query on mount), then the UI-level
 * providers that everything below can reach.
 */
const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

registerServiceWorker();

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
