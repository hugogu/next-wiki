'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginInputSchema, type LoginInput } from '@next-wiki/shared';
import { useApiMutation } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';

export function LoginForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const login = useApiMutation<LoginInput, { userId: string; mustResetPassword: boolean }>('/api/auth/login', {
    onSuccess: (data) => {
      if (data.mustResetPassword) {
        window.location.href = '/auth/set-password';
      } else {
        window.location.href = '/';
      }
    },
    onError: () => {
      setServerError('Invalid email or password.');
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
  });

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        login.mutate(data);
      })}
      className="space-y-md"
    >
      {serverError && <Alert>{serverError}</Alert>}
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-sm">
          Email
        </label>
        <Input id="email" type="email" {...register('email')} />
        {errors.email && (
          <p className="text-danger text-sm mt-xs">{errors.email.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-sm">
          Password
        </label>
        <Input id="password" type="password" {...register('password')} />
        {errors.password && (
          <p className="text-danger text-sm mt-xs">{errors.password.message}</p>
        )}
      </div>
      <Button type="submit" disabled={isSubmitting || login.isPending}>
        {login.isPending ? 'Signing in...' : 'Sign in'}
      </Button>
    </form>
  );
}
