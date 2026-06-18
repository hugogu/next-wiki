'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { setMyPasswordInputSchema } from '@next-wiki/shared';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';

type FormValues = z.infer<typeof setMyPasswordInputSchema> & { confirmPassword: string };

export function SetPasswordForm() {
  const { t } = useTranslation();
  const formSchema = setMyPasswordInputSchema.extend({
    confirmPassword: z.string().min(1, t('auth.setPassword.validation.confirmRequired')),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: t('auth.setPassword.validation.passwordsMismatch'),
    path: ['confirmPassword'],
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const setPassword = useApiMutation<{ newPassword: string }, { ok: true }>('/api/auth/set-password', {
    onSuccess: () => {
      window.location.href = '/';
    },
    onError: (err: ApiError) => {
      if (err.code === 'BAD_REQUEST') {
        setServerError(err.message);
      } else {
        setServerError(t('auth.setPassword.error.generic'));
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
          {t('auth.setPassword.fields.newPasswordLabel')}
        </label>
        <Input id="newPassword" type="password" {...register('newPassword')} />
        {errors.newPassword && <p className="text-danger text-sm mt-xs">{errors.newPassword.message}</p>}
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium mb-sm">
          {t('auth.setPassword.fields.confirmPasswordLabel')}
        </label>
        <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
        {errors.confirmPassword && <p className="text-danger text-sm mt-xs">{errors.confirmPassword.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting || setPassword.isPending}>
        {setPassword.isPending ? t('auth.setPassword.button.submitting') : t('auth.setPassword.button.submit')}
      </Button>
    </form>
  );
}
