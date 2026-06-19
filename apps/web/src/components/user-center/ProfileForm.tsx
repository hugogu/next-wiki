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
import type {
  UpdateProfileInput,
  ChangeEmailInput,
  UpdatePreferencesInput,
  PreferencesView,
} from '@next-wiki/shared';
import { useTheme } from '@/components/theme/ThemeProvider';

type FormValues = {
  displayName: string;
  email: string;
  theme: 'light' | 'dark' | 'auto';
  locale: 'en' | 'zh';
};

const formSchema = z.object({
  displayName: z.string().min(1).max(100),
  email: z.string().email(),
  theme: z.enum(['light', 'dark', 'auto']),
  locale: z.enum(['en', 'zh']),
});

export function ProfileForm({
  initialEmail,
  initialDisplayName,
  initialTheme,
  initialLocale,
}: {
  initialEmail: string;
  initialDisplayName: string;
  initialTheme: PreferencesView['theme'];
  initialLocale: PreferencesView['locale'];
}) {
  const { t, locale: currentLocale, setLocale } = useTranslation();
  const { mode, setMode } = useTheme();
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      displayName: initialDisplayName,
      email: initialEmail,
      theme: initialTheme ?? mode ?? 'auto',
      locale: initialLocale ?? currentLocale ?? 'en',
    },
  });

  const profileMutation = useApiMutation<UpdateProfileInput, { id: string; email: string; displayName: string | null }>(
    '/api/user/profile',
    { method: 'PATCH' },
  );

  const emailMutation = useApiMutation<ChangeEmailInput, { id: string; email: string }>('/api/user/email', {
    method: 'PATCH',
  });

  const preferencesMutation = useApiMutation<UpdatePreferencesInput, PreferencesView>('/api/user/preferences', {
    method: 'PATCH',
  });

  const onSubmit = async (values: FormValues) => {
    setSaved(false);
    try {
      await profileMutation.mutateAsync({ displayName: values.displayName || null });
      if (values.email !== initialEmail) {
        await emailMutation.mutateAsync({ email: values.email });
      }
      const preferences = await preferencesMutation.mutateAsync({
        theme: values.theme,
        locale: values.locale,
      });
      setMode(preferences.theme ?? 'auto');
      setLocale(preferences.locale ?? 'en');
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

  const isSubmitting =
    profileMutation.isPending || emailMutation.isPending || preferencesMutation.isPending;
  const themeOptions: FormValues['theme'][] = ['light', 'dark', 'auto'];
  const localeOptions: FormValues['locale'][] = ['en', 'zh'];
  const selectedTheme = watch('theme');
  const selectedLocale = watch('locale');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
      <div className="grid gap-xl lg:grid-cols-2">
        <section className="space-y-md">
          <h2 className="font-display text-xl font-semibold">{t('userCenter.profile.heading')}</h2>

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
        </section>

        <section className="space-y-md lg:border-l lg:border-border lg:pl-xl">
          <h2 className="font-display text-xl font-semibold">{t('userCenter.preferences.heading')}</h2>

          <div>
            <p className="text-sm font-medium mb-2">{t('userCenter.preferences.themeLabel')}</p>
            <div className="inline-flex flex-wrap gap-xs rounded-lg border border-border bg-background p-xs">
              {themeOptions.map((option) => (
                <label
                  key={option}
                  className={`cursor-pointer rounded-md px-md py-sm text-sm font-medium transition-colors ${
                    selectedTheme === option
                      ? 'bg-primary text-primary-text'
                      : 'text-muted hover:bg-surface-elevated hover:text-foreground'
                  }`}
                >
                  <input type="radio" value={option} {...register('theme')} className="sr-only" />
                  <span>{t(`theme.mode.${option}` as never)}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">{t('userCenter.preferences.languageLabel')}</p>
            <div className="inline-flex flex-wrap gap-xs rounded-lg border border-border bg-background p-xs">
              {localeOptions.map((option) => (
                <label
                  key={option}
                  className={`cursor-pointer rounded-md px-md py-sm text-sm font-medium transition-colors ${
                    selectedLocale === option
                      ? 'bg-primary text-primary-text'
                      : 'text-muted hover:bg-surface-elevated hover:text-foreground'
                  }`}
                >
                  <input type="radio" value={option} {...register('locale')} className="sr-only" />
                  <span>{t(`language.${option}` as never)}</span>
                </label>
              ))}
            </div>
          </div>

          {errors.theme && <p className="text-danger text-sm">{errors.theme.message}</p>}
        </section>
      </div>

      <div className="flex items-center gap-sm border-t border-border pt-md">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('userCenter.profile.savingButton') : t('userCenter.profile.saveButton')}
        </Button>
        {saved && <span className="text-success text-sm">{t('userCenter.profile.savedMessage')}</span>}
      </div>
    </form>
  );
}
