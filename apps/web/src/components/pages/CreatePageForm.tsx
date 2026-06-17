'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPageInputSchema, type CreatePageInput } from '@next-wiki/shared';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { getPageHref } from '@/lib/path';
import { SplitMarkdownEditor } from '@/components/editor/SplitMarkdownEditor';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';

export function CreatePageForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const create = useApiMutation<CreatePageInput, { pageId: string; versionId: string }>('/api/pages', {
    onSuccess: (_data, vars) => {
      router.push(getPageHref(vars.path));
      window.location.href = getPageHref(vars.path);
    },
    onError: (err: ApiError) => {
      if (err.code === 'CONFLICT') {
        setServerError('A page with this path already exists.');
      } else if (err.code === 'FORBIDDEN' || err.code === 'UNAUTHORIZED') {
        setServerError('You do not have permission to create pages.');
      } else {
        setServerError(err.message || 'Failed to create page.');
      }
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreatePageInput>({
    resolver: zodResolver(createPageInputSchema),
    defaultValues: { path: '', title: '', contentSource: '' },
  });

  const contentSource = watch('contentSource');

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        create.mutate(data);
      })}
      className="h-full flex flex-col"
    >
      <div className="shrink-0 flex items-center gap-md px-lg py-md border-b border-border bg-surface">
        <div className="flex-1 flex items-center gap-md">
          <div className="w-56">
            <Input
              {...register('path')}
              placeholder="path/to/page"
              aria-label="Path"
              className="text-sm"
            />
            {errors.path && <p className="text-danger text-xs mt-xs">{errors.path.message}</p>}
          </div>
          <div className="flex-1">
            <Input
              {...register('title')}
              placeholder="Page title"
              aria-label="Title"
              className="text-sm"
            />
            {errors.title && <p className="text-danger text-xs mt-xs">{errors.title.message}</p>}
          </div>
        </div>
        <button
          type="submit"
          disabled={isSubmitting || create.isPending}
          className="inline-flex items-center px-md py-sm rounded-md bg-primary text-primary-text text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
        >
          {create.isPending ? 'Saving...' : 'Save draft'}
        </button>
      </div>

      {serverError && (
        <div className="shrink-0 px-lg py-sm">
          <Alert>{serverError}</Alert>
        </div>
      )}

      <div className="flex-1 overflow-hidden p-md">
        <SplitMarkdownEditor
          value={contentSource}
          onChange={(v) => setValue('contentSource', v, { shouldValidate: true })}
          disabled={create.isPending}
        />
        {errors.contentSource && <p className="text-danger text-sm mt-xs">{errors.contentSource.message}</p>}
      </div>
    </form>
  );
}
