'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const OUTLINE_STORAGE_KEY = 'next-wiki-outline';

type OutlineState = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
};

/**
 * Whether the reader's Outline is folded away, remembered in this browser only.
 * Public reader pages are cached static documents that must not vary by who
 * asks, so the choice never reaches the server: every page is delivered with the
 * Outline open and the saved choice is applied once it runs in the browser.
 *
 * The store reads localStorage as soon as it is created in the browser, but
 * React renders its first (hydration) pass from the initial state so it matches
 * the server's HTML, then switches to the saved choice. A page the reader opens
 * by following a link inside the app has no hydration pass and shows the saved
 * choice from its first render.
 */
export const useOutlineStore = create<OutlineState>()(
  persist(
    (set) => ({
      collapsed: false,
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    { name: OUTLINE_STORAGE_KEY },
  ),
);
