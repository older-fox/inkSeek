import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeId = 'snow' | 'paper' | 'dusk' | 'moss';
export type ThemeScheme = 'light' | 'dark';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  scheme: ThemeScheme;
  themeColor: string;
  preview: { base: string; panel: string; accent: string };
}

const THEME_MAP: Record<ThemeId, ThemeDefinition> = {
  snow: {
    id: 'snow',
    name: '雪白',
    description: '纯白底 · 冷灰层次',
    scheme: 'light',
    themeColor: '#f7f8fa',
    preview: { base: '#f7f8fa', panel: '#ffffff', accent: '#9c6c22' },
  },
  paper: {
    id: 'paper',
    name: '宣纸',
    description: '暖白底 · 米色纸感',
    scheme: 'light',
    themeColor: '#f3eee3',
    preview: { base: '#f3eee3', panel: '#fdfbf6', accent: '#b17a28' },
  },
  dusk: {
    id: 'dusk',
    name: '暮蓝',
    description: '深蓝灰 · 柔和暗色',
    scheme: 'dark',
    themeColor: '#151c26',
    preview: { base: '#151c26', panel: '#202b38', accent: '#e6bd7a' },
  },
  moss: {
    id: 'moss',
    name: '松墨',
    description: '墨绿灰 · 沉静暗色',
    scheme: 'dark',
    themeColor: '#131b16',
    preview: { base: '#131b16', panel: '#1e2a23', accent: '#8ccfbd' },
  },
};

export const THEMES: readonly ThemeDefinition[] = [
  THEME_MAP.snow,
  THEME_MAP.paper,
  THEME_MAP.dusk,
  THEME_MAP.moss,
];

const STORAGE_KEY = 'inkseek-theme';
const LEGACY_THEMES: Record<string, ThemeId> = { light: 'snow', dark: 'dusk' };

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Returns the palette metadata for a theme id. */
export function getThemeDefinition(theme: ThemeId): ThemeDefinition {
  return THEME_MAP[theme];
}

/** Type guard for theme ids read from the document or storage. */
function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((item) => item.id === value);
}

/** Picks the startup theme from the document, legacy keys or the OS color scheme. */
function readInitialTheme(): ThemeId {
  const current = document.documentElement.dataset.theme ?? null;

  if (isThemeId(current)) {
    return current;
  }

  if (current && LEGACY_THEMES[current]) {
    return LEGACY_THEMES[current];
  }

  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'snow' : 'dusk';
}

/** Stores the chosen theme locally, ignoring unavailable storage. */
function persist(theme: ThemeId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage can be unavailable in private or restricted contexts */
  }
}

/** Applies the selected theme to the document root and shares it with the app tree. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readInitialTheme);

  /** Switches the theme and persists it; document attributes follow via the effect below. */
  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    persist(next);
  }, []);

  useEffect(() => {
    const definition = getThemeDefinition(theme);
    const root = document.documentElement;

    root.dataset.theme = definition.id;
    root.style.colorScheme = definition.scheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', definition.themeColor);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Reads the current theme and setter from context; throws outside ThemeProvider. */
export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}
