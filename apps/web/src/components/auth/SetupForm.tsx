'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setupInputSchema, type SetupInput } from '@next-wiki/shared';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { getLocalizedErrorMessage } from '@/i18n/error-messages';

/**
 * Account step of first-run onboarding: creates the initial Admin and hands
 * off to the next onboarding step through server state instead of navigating
 * away from /setup.
 */
export function SetupForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const setup = useApiMutation<SetupInput, { ok: true; nextStep?: string }>('/api/auth/setup', {
    onSuccess: () => {
      // The session cookie is already set by the response; refresh the setup
      // state so the onboarding shell advances to the next step.
      void queryClient.invalidateQueries({ queryKey: ['setup-state'] });
    },
    onError: (err: ApiError) => {
      if (err.code === 'CONFLICT') {
        setServerError(t('auth.register.error.emailExists'));
      } else if (err.code === 'FORBIDDEN') {
        setServerError(t('auth.setup.error.alreadyConfigured'));
      } else if (err.code === 'BAD_REQUEST') {
        setServerError(getLocalizedErrorMessage(t, err, 'auth.setup.error.generic'));
      } else {
        setServerError(t('auth.setup.error.generic'));
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
          {t('auth.setup.fields.emailLabel')}
        </label>
        <Input id="email" type="email" {...register('email')} />
        {errors.email && <p className="text-danger text-sm mt-xs">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-sm">
          {t('auth.fields.passwordLabel')}
        </label>
        <Input id="password" type="password" {...register('password')} />
        {errors.password && <p className="text-danger text-sm mt-xs">{errors.password.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting || setup.isPending}>
        {setup.isPending ? t('auth.setup.button.submitting') : t('auth.setup.button.submit')}
      </Button>
    </form>
  );
}
