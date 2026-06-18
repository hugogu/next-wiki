'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'next-wiki-theme';

function resolve(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'auto';
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  return stored ?? 'auto';
}

function setStoredTheme(mode: ThemeMode) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, mode);
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const resolvedMode = resolve(mode);
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(resolvedMode);
}

export function ThemeProvider({
  children,
  initialMode,
}: {
  children: React.ReactNode;
  initialMode?: ThemeMode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return initialMode ?? 'auto';
    const stored = getStoredTheme();
    return stored ?? initialMode ?? 'auto';
  });
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    resolve(mode),
  );

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (mode === 'auto') {
        setResolved(resolve('auto'));
        applyTheme('auto');
      }
    };
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    setResolved(resolve(next));
    setStoredTheme(next);
    applyTheme(next);
  }, []);

  const cycle = useCallback(() => {
    const order: ThemeMode[] = ['auto', 'light', 'dark'];
    const index = order.indexOf(mode);
    const nextIndex = (index + 1) % order.length;
    const next = order[nextIndex];
    if (!next) return;
    setMode(next);
  }, [mode, setMode]);

  return <ThemeContext.Provider value={{ mode, resolved, setMode, cycle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
