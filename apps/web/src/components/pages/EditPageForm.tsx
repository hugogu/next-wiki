'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { newDraftBodySchema, type NewDraftBody } from '@next-wiki/shared';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { getApiPageEditUrl, getHistoryHref } from '@/lib/path';
import { SplitMarkdownEditor } from '@/components/editor/SplitMarkdownEditor';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';

export function EditPageForm({ path, initial }: { path: string; initial: { title: string; contentSource: string; canPublish: boolean; latestVersion: number } }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const save = useApiMutation<NewDraftBody, { versionId: string; versionNumber: number }>(getApiPageEditUrl(path), {
    onSuccess: () => {
      router.push(getHistoryHref(path));
      window.location.href = getHistoryHref(path);
    },
    onError: (err: ApiError) => {
      if (err.code === 'FORBIDDEN' || err.code === 'UNAUTHORIZED') {
        setServerError('You do not have permission to edit this page.');
      } else {
        setServerError(err.message || 'Failed to save changes.');
      }
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NewDraftBody>({
    resolver: zodResolver(newDraftBodySchema),
    defaultValues: { title: initial.title, contentSource: initial.contentSource },
  });

  const contentSource = watch('contentSource');

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        save.mutate(data);
      })}
      className="h-full flex flex-col"
    >
      <div className="shrink-0 flex items-center gap-md px-lg py-md border-b border-border bg-surface">
        <div className="flex-1">
          <Input
            {...register('title')}
            placeholder="Page title"
            aria-label="Title"
            className="text-sm"
          />
          {errors.title && <p className="text-danger text-xs mt-xs">{errors.title.message}</p>}
        </div>
        <button
          type="submit"
          disabled={isSubmitting || save.isPending}
          className="inline-flex items-center px-md py-sm rounded-md bg-primary text-primary-text text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
        >
          {save.isPending ? 'Saving...' : 'Save new draft'}
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
          disabled={save.isPending}
        />
        {errors.contentSource && <p className="text-danger text-sm mt-xs">{errors.contentSource.message}</p>}
      </div>
    </form>
  );
}
