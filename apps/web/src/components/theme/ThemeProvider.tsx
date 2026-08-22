'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

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

function getStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
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
  forcedMode,
}: {
  children: React.ReactNode;
  initialMode?: ThemeMode;
  /** Transient `?theme=` override. It intentionally never updates storage. */
  forcedMode?: ThemeMode;
}) {
  const searchParams = useSearchParams();
  const urlTheme = searchParams?.get('theme') ?? null;
  const queryMode: ThemeMode | undefined = urlTheme === 'light' || urlTheme === 'dark' || urlTheme === 'auto'
    ? urlTheme
    : undefined;
  const override = queryMode ?? forcedMode;
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return forcedMode ?? initialMode ?? 'auto';
    const stored = getStoredTheme();
    return stored ?? initialMode ?? 'auto';
  });
  // Re-render on an OS colour-scheme change while the effective mode is auto.
  // The resolved value itself is derived, avoiding a stale frame on URL changes.
  const [, refreshResolvedTheme] = useState(0);
  const resolved = resolve(override ?? mode);

  useEffect(() => {
    applyTheme(override ?? mode);
  }, [mode, override]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if ((override ?? mode) === 'auto') {
        refreshResolvedTheme((version) => version + 1);
        applyTheme('auto');
      }
    };
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [mode, override]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
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

  return <ThemeContext.Provider value={{ mode: override ?? mode, resolved, setMode, cycle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
