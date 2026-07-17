'use client';

import { useQuery } from '@tanstack/react-query';
import {
  apiGet,
  useApiMutation,
  type ApiError,
} from '@/lib/api/client';
import type {
  SetupAiBootstrapInput,
  SetupAiBootstrapResponse,
  SetupSamplePagesInput,
  SetupSamplePagesResponse,
  SetupStateView,
} from '@next-wiki/shared';

export type { ApiError };

/** Polls the uncached setup state; refetches quickly while AI bootstrap runs. */
export function useSetupState(initial: SetupStateView) {
  return useQuery({
    queryKey: ['setup-state'],
    queryFn: () => apiGet<SetupStateView>('/api/setup'),
    initialData: initial,
    refetchInterval: (query) =>
      query.state.data?.aiStatus === 'queued' || query.state.data?.aiStatus === 'running' ? 2000 : false,
  });
}

export function useAiBootstrapMutation(
  options?: {
    onSuccess?: (result: SetupAiBootstrapResponse) => void;
    onError?: (error: ApiError) => void;
  },
) {
  return useApiMutation<SetupAiBootstrapInput, SetupAiBootstrapResponse>('/api/setup/ai-bootstrap', {
    method: 'PUT',
    ...options,
  });
}

export function useSamplePagesMutation(
  options?: {
    onSuccess?: (result: SetupSamplePagesResponse) => void;
    onError?: (error: ApiError) => void;
  },
) {
  return useApiMutation<SetupSamplePagesInput, SetupSamplePagesResponse>('/api/setup/sample-pages', {
    method: 'PUT',
    ...options,
  });
}
