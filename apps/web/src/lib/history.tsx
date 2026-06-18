'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type HistoryContextValue = {
  previousPath: string | null;
  goBack: (fallbackHref: string) => void;
};

const HistoryContext = createContext<HistoryContextValue>({
  previousPath: null,
  goBack: () => {},
});

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const stackRef = useRef<string[]>([]);
  const [previousPath, setPreviousPath] = useState<string | null>(null);

  useEffect(() => {
    if (!pathname) {
      return;
    }

    const stack = stackRef.current;

    if (stack.length === 0) {
      stackRef.current = [pathname];
      setPreviousPath(null);
      return;
    }

    const last = stack[stack.length - 1] ?? null;
    if (last === pathname) {
      return;
    }

    const secondLast = stack[stack.length - 2] ?? null;
    if (secondLast === pathname) {
      stackRef.current = stack.slice(0, -1);
      setPreviousPath(stackRef.current[stackRef.current.length - 2] ?? null);
      return;
    }

    stackRef.current = [...stack, pathname];
    setPreviousPath(last);
  }, [pathname]);

  const goBack = useCallback(
    (fallbackHref: string) => {
      const prev = stackRef.current[stackRef.current.length - 2] ?? null;
      if (prev) {
        router.back();
      } else {
        router.push(fallbackHref);
      }
    },
    [router],
  );

  return (
    <HistoryContext.Provider value={{ previousPath, goBack }}>{children}</HistoryContext.Provider>
  );
}

export function useHistory(): HistoryContextValue {
  return useContext(HistoryContext);
}
