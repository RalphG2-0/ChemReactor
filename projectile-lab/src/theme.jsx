import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

const THEMES = {
  dark: {
    bgPage: '#0B0F14',
    bgCard: '#0F1720',
    bgInput: '#131C24',
    border: '#1E2A35',
    borderStrong: '#2A363F',
    borderFaint: '#1A232B',
    borderMid: '#3A4753',
    accent: '#5EEAD4',
    accentInk: '#0B0F14',
    accent2: '#F5A623',
    error: '#E5484D',
    text: '#DCE4EA',
    textMuted: '#9AA7B2',
    textDim: '#7B8894',
    textFaint: '#5C6A76',
  },
  light: {
    bgPage: '#F3F6F7',
    bgCard: '#FFFFFF',
    bgInput: '#EDF1F3',
    border: '#DEE5E8',
    borderStrong: '#C3CDD2',
    borderFaint: '#E7ECEE',
    borderMid: '#9AA7AE',
    accent: '#0C8577',
    accentInk: '#FFFFFF',
    accent2: '#B5650A',
    error: '#C82C33',
    text: '#1A2530',
    textMuted: '#57646D',
    textDim: '#6D7981',
    textFaint: '#889198',
  },
};

export function hexToRgba(hex, alpha = 1) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const STORAGE_KEY = 'cyberlab-theme';
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // localStorage unavailable — fall through to default
    }
    return 'dark';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore — theme just won't persist
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const colors = useMemo(() => THEMES[theme], [theme]);
  const value = useMemo(() => ({ theme, colors, toggleTheme, setTheme }), [theme, colors, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
