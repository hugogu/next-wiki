'use client';

import { createContext, useContext } from 'react';
import type { AiEntitlementView } from '@next-wiki/shared';

const AiAvailabilityContext = createContext<AiEntitlementView | null>(null);

export function AiAvailabilityProvider({
  value,
  children,
}: {
  value: AiEntitlementView | null;
  children: React.ReactNode;
}) {
  return <AiAvailabilityContext.Provider value={value}>{children}</AiAvailabilityContext.Provider>;
}

export function useAiAvailability() {
  return useContext(AiAvailabilityContext);
}
