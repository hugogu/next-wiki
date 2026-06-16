'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { setupInputSchema, type SetupInput } from '@next-wiki/shared';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';

export function SetupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const setup = trpc.auth.setup.useMutation({
    onSuccess: () => {
      window.location.href = '/';
    },
    onError: (err) => {
      if (err.data?.code === 'CONFLICT') {
        setServerError('An account with this email already exists.');
      } else if (err.data?.code === 'FORBIDDEN') {
        setServerError('Setup is no longer available. An admin account already exists.');
      } else if (err.data?.code === 'BAD_REQUEST') {
        setServerError(err.message);
      } else {
        setServerError('Failed to create admin account.');
      }
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetupInput>({
    resolver: zodResolver(setupInputSchema),
  });

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        setup.mutate(data);
      })}
      className="space-y-md"
    >
      {serverError && <Alert>{serverError}</Alert>}
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-sm">
          Admin email
        </label>
        <Input id="email" type="email" {...register('email')} />
        {errors.email && <p className="text-danger text-sm mt-xs">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-sm">
          Password
        </label>
        <Input id="password" type="password" {...register('password')} />
        {errors.password && <p className="text-danger text-sm mt-xs">{errors.password.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting || setup.isPending}>
        {setup.isPending ? 'Creating admin...' : 'Create admin account'}
      </Button>
    </form>
  );
}
