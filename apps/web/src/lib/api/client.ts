import {
  useMutation,
  type UseMutationOptions,
} from '@tanstack/react-query';

export type ApiError = {
  code: string;
  message: string;
};

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function apiFetch<TInput, TOutput>(
  path: string,
  input: TInput,
  method: HttpMethod = 'POST',
): Promise<TOutput> {
  const options: RequestInit = {
    method,
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  };

  if (method !== 'GET') {
    options.headers = {
      ...options.headers,
      'Content-Type': 'application/json',
    };
    options.body = JSON.stringify(input);
  }

  const res = await fetch(path, options);
  const data = (await res.json().catch(() => ({}))) as TOutput | ApiError;

  if (!res.ok) {
    const err = data as ApiError;
    throw err;
  }

  return data as TOutput;
}

type MutationOptions<TInput, TOutput> = Omit<UseMutationOptions<TOutput, ApiError, TInput>, 'mutationFn'> & {
  method?: HttpMethod;
};

export function useApiMutation<TInput = void, TOutput = unknown>(
  path: string | ((input: TInput) => string),
  options?: MutationOptions<TInput, TOutput>,
) {
  const { method = 'POST', ...rest } = options ?? {};
  return useMutation<TOutput, ApiError, TInput>({
    mutationFn: (input) => {
      const resolvedPath = typeof path === 'function' ? path(input) : path;
      return apiFetch<TInput, TOutput>(resolvedPath, input, method);
    },
    ...rest,
  });
}

export async function apiPost<TInput, TOutput>(path: string, input: TInput): Promise<TOutput> {
  return apiFetch<TInput, TOutput>(path, input, 'POST');
}

export async function apiPatch<TInput, TOutput>(path: string, input: TInput): Promise<TOutput> {
  return apiFetch<TInput, TOutput>(path, input, 'PATCH');
}

export async function apiPut<TInput, TOutput>(path: string, input: TInput): Promise<TOutput> {
  return apiFetch<TInput, TOutput>(path, input, 'PUT');
}

export async function apiGet<TOutput>(path: string): Promise<TOutput> {
  return apiFetch<undefined, TOutput>(path, undefined, 'GET');
}

export async function apiDelete<TOutput>(path: string): Promise<TOutput> {
  return apiFetch<undefined, TOutput>(path, undefined, 'DELETE');
}
