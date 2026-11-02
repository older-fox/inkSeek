import '@fontsource-variable/sora/index.css';
import '@fontsource-variable/manrope/index.css';
import '@fontsource-variable/noto-sans-sc/index.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/query-client';
import { router } from '@/router';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster
        position="top-right"
        theme="dark"
        toastOptions={{
          style: {
            background: '#0e1620',
            border: '1px solid rgba(230, 189, 122, 0.18)',
            color: '#f4efe6',
            fontFamily: 'Manrope Variable, Noto Sans SC Variable, sans-serif',
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
);
