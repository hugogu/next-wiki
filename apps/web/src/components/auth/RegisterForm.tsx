'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerInputSchema, type RegisterInput } from '@next-wiki/shared';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function RegisterForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const register = trpc.auth.register.useMutation({
    onSuccess: () => {
      window.location.href = '/';
    },
    onError: (err) => {
      if (err.data?.code === 'CONFLICT') {
        setServerError('An account with this email already exists.');
      } else {
        setServerError('Registration failed. Please try again.');
      }
    },
  });

  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerInputSchema),
  });

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        register.mutate(data);
      })}
      className="space-y-md"
    >
      {serverError && (
        <div className="p-md bg-danger/10 text-danger rounded-md text-sm" role="alert">
          {serverError}
        </div>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-sm">
          Email
        </label>
        <Input id="email" type="email" {...registerField('email')} />
        {errors.email && (
          <p className="text-danger text-sm mt-xs">{errors.email.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-sm">
          Password
        </label>
        <Input id="password" type="password" {...registerField('password')} />
        {errors.password && (
          <p className="text-danger text-sm mt-xs">{errors.password.message}</p>
        )}
      </div>
      <Button type="submit" disabled={isSubmitting || register.isPending}>
        {register.isPending ? 'Creating account...' : 'Create account'}
      </Button>
    </form>
  );
}
