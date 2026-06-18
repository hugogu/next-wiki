'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from '@/i18n/client';
import { useApiMutation } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { UpdateProfileInput, ChangeEmailInput } from '@next-wiki/shared';

type FormValues = {
  displayName: string;
  email: string;
};

const formSchema = z.object({
  displayName: z.string().min(1).max(100),
  email: z.string().email(),
});

export function ProfileForm({
  initialEmail,
  initialDisplayName,
}: {
  initialEmail: string;
  initialDisplayName: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      displayName: initialDisplayName,
      email: initialEmail,
    },
  });

  const profileMutation = useApiMutation<UpdateProfileInput, { id: string; email: string; displayName: string | null }>(
    '/api/user/profile',
    { method: 'PATCH' },
  );

  const emailMutation = useApiMutation<ChangeEmailInput, { id: string; email: string }>('/api/user/email', {
    method: 'PATCH',
  });

  const onSubmit = async (values: FormValues) => {
    setSaved(false);
    try {
      await profileMutation.mutateAsync({ displayName: values.displayName || null });
      if (values.email !== initialEmail) {
        await emailMutation.mutateAsync({ email: values.email });
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'CONFLICT') {
        setError('email', { message: error.message || 'Email already in use' });
      } else {
        setError('email', { message: error.message || 'Failed to save profile' });
      }
    }
  };

  const isSubmitting = profileMutation.isPending || emailMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
      <h2 className="font-display text-xl font-semibold mb-md">{t('userCenter.profile.heading')}</h2>

      <div>
        <label htmlFor="displayName" className="block text-sm font-medium mb-1">
          {t('userCenter.profile.displayNameLabel')}
        </label>
        <Input id="displayName" {...register('displayName')} aria-invalid={errors.displayName ? 'true' : 'false'} />
        {errors.displayName && <p className="text-danger text-sm mt-1">{errors.displayName.message}</p>}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          {t('userCenter.profile.emailLabel')}
        </label>
        <Input id="email" type="email" {...register('email')} aria-invalid={errors.email ? 'true' : 'false'} />
        {errors.email && <p className="text-danger text-sm mt-1">{errors.email.message}</p>}
      </div>

      <div className="flex items-center gap-sm pt-sm">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('userCenter.profile.savingButton') : t('userCenter.profile.saveButton')}
        </Button>
        {saved && <span className="text-success text-sm">{t('userCenter.profile.savedMessage')}</span>}
      </div>
    </form>
  );
}
