'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { setMyPasswordInputSchema } from '@next-wiki/shared';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';

const formSchema = setMyPasswordInputSchema.extend({
  confirmPassword: z.string().min(1, 'Confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormValues = z.infer<typeof formSchema>;

export function SetPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const setPassword = trpc.auth.setMyPassword.useMutation({
    onSuccess: () => {
      window.location.href = '/';
    },
    onError: (err) => {
      if (err.data?.code === 'BAD_REQUEST') {
        setServerError(err.message);
      } else {
        setServerError('Failed to update password.');
      }
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        setPassword.mutate({ newPassword: data.newPassword });
      })}
      className="space-y-md"
    >
      {serverError && <Alert>{serverError}</Alert>}
      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium mb-sm">
          New password
        </label>
        <Input id="newPassword" type="password" {...register('newPassword')} />
        {errors.newPassword && <p className="text-danger text-sm mt-xs">{errors.newPassword.message}</p>}
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium mb-sm">
          Confirm new password
        </label>
        <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
        {errors.confirmPassword && <p className="text-danger text-sm mt-xs">{errors.confirmPassword.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting || setPassword.isPending}>
        {setPassword.isPending ? 'Updating...' : 'Set new password'}
      </Button>
    </form>
  );
}
