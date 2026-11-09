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
import { ThemeProvider, getThemeDefinition, useTheme } from '@/lib/theme';
import { router } from '@/router';
import './styles.css';

/** Separate component because it calls useTheme, so it has to render inside ThemeProvider rather than beside it. */
function ThemedToaster() {
  const { theme } = useTheme();

  return (
    <Toaster
      position="top-right"
      theme={getThemeDefinition(theme).scheme}
      toastOptions={{
        style: {
          background: 'var(--color-ink-850)',
          border: '1px solid var(--glass-border)',
          color: 'var(--color-mist-100)',
          fontFamily: 'Manrope Variable, Noto Sans SC Variable, sans-serif',
        },
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
