'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { publicPagePropertiesInputSchema, type PublicPagePropertiesInput, type PublicPageResource, updatePagePropertiesSchema, type UpdatePagePropertiesInput } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { getPublicApiPagePropertiesUrl, getPageHref } from '@/lib/path';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';

export function PagePropertiesForm({ pageId, path }: { pageId: string; path: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const update = useApiMutation<PublicPagePropertiesInput, PublicPageResource>(getPublicApiPagePropertiesUrl(pageId), {
    method: 'PATCH',
    onSuccess: (data) => {
      if (data.path === path) {
        router.refresh();
      } else {
        window.location.href = getPageHref(data.path) + '/properties';
      }
    },
    onError: (err: ApiError) => {
      if (err.code === 'CONFLICT' || err.code === 'PAGE_PATH_CONFLICT') {
        setServerError(t('page.properties.error.pathExists'));
      } else if (err.code === 'FORBIDDEN' || err.code === 'UNAUTHORIZED') {
        setServerError(t('page.properties.error.forbidden'));
      } else {
        setServerError(err.message || t('page.properties.error.generic'));
      }
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePagePropertiesInput>({
    resolver: zodResolver(updatePagePropertiesSchema),
    defaultValues: { path },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        update.mutate(publicPagePropertiesInputSchema.parse(data));
      })}
      className="bg-surface border border-border rounded-lg p-lg space-y-md"
    >
      <div>
        <label htmlFor="path" className="block text-sm font-medium mb-xs">
          {t('page.properties.fields.pathLabel')}
        </label>
        <Input
          id="path"
          {...register('path')}
          placeholder={t('page.properties.fields.pathPlaceholder')}
          aria-label="Path"
          className="text-sm"
        />
        {errors.path && <p className="text-danger text-xs mt-xs">{errors.path.message}</p>}
        <p className="text-xs text-muted mt-xs">
          {t('page.properties.fields.pathHint', { example: 'docs/getting-started' })}
        </p>
      </div>

      {serverError && <Alert>{serverError}</Alert>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting || update.isPending}
          className="inline-flex items-center px-md py-sm rounded-md bg-primary text-primary-text text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
        >
          {update.isPending ? t('page.properties.button.submitting') : t('page.properties.button.submit')}
        </button>
      </div>
    </form>
  );
}
