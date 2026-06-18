'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from '@/i18n/client';
import { useApiMutation } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ChangePasswordInput } from '@next-wiki/shared';
import { changePasswordInputSchema } from '@next-wiki/shared';

const formSchema = changePasswordInputSchema
  .extend({
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof formSchema>;

export function PasswordChangeForm() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const mutation = useApiMutation<ChangePasswordInput, { ok: boolean }>('/api/user/password', {
    method: 'POST',
  });

  const onSubmit = async (values: FormValues) => {
    setSaved(false);
    try {
      await mutation.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      setSaved(true);
      reset();
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'UNAUTHORIZED') {
        setError('currentPassword', { message: error.message || 'Current password is incorrect' });
      } else {
        setError('newPassword', { message: error.message || 'Failed to change password' });
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
      <h2 className="font-display text-xl font-semibold mb-md">{t('userCenter.password.heading')}</h2>

      <div>
        <label htmlFor="currentPassword" className="block text-sm font-medium mb-1">
          {t('userCenter.password.currentPasswordLabel')}
        </label>
        <Input
          id="currentPassword"
          type="password"
          {...register('currentPassword')}
          aria-invalid={errors.currentPassword ? 'true' : 'false'}
        />
        {errors.currentPassword && <p className="text-danger text-sm mt-1">{errors.currentPassword.message}</p>}
      </div>

      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium mb-1">
          {t('userCenter.password.newPasswordLabel')}
        </label>
        <Input
          id="newPassword"
          type="password"
          {...register('newPassword')}
          aria-invalid={errors.newPassword ? 'true' : 'false'}
        />
        {errors.newPassword && <p className="text-danger text-sm mt-1">{errors.newPassword.message}</p>}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
          {t('userCenter.password.confirmPasswordLabel')}
        </label>
        <Input
          id="confirmPassword"
          type="password"
          {...register('confirmPassword')}
          aria-invalid={errors.confirmPassword ? 'true' : 'false'}
        />
        {errors.confirmPassword && <p className="text-danger text-sm mt-1">{errors.confirmPassword.message}</p>}
      </div>

      <div className="flex items-center gap-sm pt-sm">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t('userCenter.password.changingButton') : t('userCenter.password.changeButton')}
        </Button>
        {saved && <span className="text-success text-sm">{t('userCenter.password.successMessage')}</span>}
      </div>
    </form>
  );
}
