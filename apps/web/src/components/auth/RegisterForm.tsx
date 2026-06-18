'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerInputSchema, type RegisterInput } from '@next-wiki/shared';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';

export function RegisterForm() {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const register = useApiMutation<RegisterInput, { userId: string }>('/api/auth/register', {
    onSuccess: () => {
      window.location.href = '/';
    },
    onError: (err: ApiError) => {
      if (err.code === 'CONFLICT') {
        setServerError(t('auth.register.error.emailExists'));
      } else {
        setServerError(t('auth.register.error.generic'));
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
      {serverError && <Alert>{serverError}</Alert>}
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-sm">
          {t('auth.fields.emailLabel')}
        </label>
        <Input id="email" type="email" {...registerField('email')} />
        {errors.email && (
          <p className="text-danger text-sm mt-xs">{errors.email.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-sm">
          {t('auth.fields.passwordLabel')}
        </label>
        <Input id="password" type="password" {...registerField('password')} />
        {errors.password && (
          <p className="text-danger text-sm mt-xs">{errors.password.message}</p>
        )}
      </div>
      <Button type="submit" disabled={isSubmitting || register.isPending}>
        {register.isPending ? t('auth.register.button.submitting') : t('auth.register.button.submit')}
      </Button>
    </form>
  );
}
