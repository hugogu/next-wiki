'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from '@/i18n/client';
import { useApiMutation } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import type { UpdatePreferencesInput, PreferencesView } from '@next-wiki/shared';
import { useTheme } from '@/components/theme/ThemeProvider';

type ThemeOption = 'light' | 'dark' | 'auto';
type LocaleOption = 'en' | 'zh';

type FormValues = {
  theme: ThemeOption;
  locale: LocaleOption;
};

export function PreferencesForm({
  initialTheme,
  initialLocale,
}: {
  initialTheme: PreferencesView['theme'];
  initialLocale: PreferencesView['locale'];
}) {
  const { t, locale: currentLocale, setLocale } = useTranslation();
  const { mode, setMode } = useTheme();
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setError,
  } = useForm<FormValues>({
    defaultValues: {
      theme: initialTheme ?? mode ?? 'auto',
      locale: initialLocale ?? currentLocale ?? 'en',
    },
  });

  const mutation = useApiMutation<UpdatePreferencesInput, PreferencesView>('/api/user/preferences', {
    method: 'PATCH',
  });

  const onSubmit = async (values: FormValues) => {
    setSaved(false);
    try {
      const result = await mutation.mutateAsync({
        theme: values.theme,
        locale: values.locale,
      });
      setMode((result.theme as ThemeOption) ?? 'auto');
      setLocale((result.locale as LocaleOption) ?? 'en');
      setSaved(true);
    } catch (err) {
      const error = err as { message?: string };
      setError('theme', { message: error.message || 'Failed to save preferences' });
    }
  };

  const themeOptions: ThemeOption[] = ['light', 'dark', 'auto'];
  const localeOptions: LocaleOption[] = ['en', 'zh'];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
      <h2 className="font-display text-xl font-semibold mb-md">{t('userCenter.preferences.heading')}</h2>

      <div>
        <p className="text-sm font-medium mb-2">{t('userCenter.preferences.themeLabel')}</p>
        <div className="flex gap-sm">
          {themeOptions.map((option) => (
            <label key={option} className="flex items-center gap-2 px-md py-sm rounded-md border border-border bg-background cursor-pointer">
              <input type="radio" value={option} {...register('theme')} />
              <span>{t(`theme.mode.${option}` as never)}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">{t('userCenter.preferences.languageLabel')}</p>
        <div className="flex gap-sm">
          {localeOptions.map((option) => (
            <label key={option} className="flex items-center gap-2 px-md py-sm rounded-md border border-border bg-background cursor-pointer">
              <input type="radio" value={option} {...register('locale')} />
              <span>{t(`language.${option}` as never)}</span>
            </label>
          ))}
        </div>
      </div>

      {errors.theme && <p className="text-danger text-sm">{errors.theme.message}</p>}

      <div className="flex items-center gap-sm pt-sm">
        <Button type="submit" disabled={mutation.isPending || !isDirty}>
          {mutation.isPending ? t('userCenter.preferences.savingButton') : t('userCenter.preferences.saveButton')}
        </Button>
        {saved && <span className="text-success text-sm">{t('userCenter.preferences.savedMessage')}</span>}
      </div>
    </form>
  );
}
