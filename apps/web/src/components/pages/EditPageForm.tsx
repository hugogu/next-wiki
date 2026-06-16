'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { newDraftInputSchema, type NewDraftInput } from '@next-wiki/shared';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { PublishButton } from '@/components/pages/PublishButton';

export function EditPageForm({ slug, initial }: { slug: string; initial: { title: string; contentSource: string; canPublish: boolean; latestVersion: number } }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const save = trpc.pages.newDraft.useMutation({
    onSuccess: () => {
      router.push(`/${slug}/history`);
      window.location.href = `/${slug}/history`;
    },
    onError: (err) => {
      if (err.data?.code === 'FORBIDDEN' || err.data?.code === 'UNAUTHORIZED') {
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
  } = useForm<NewDraftInput>({
    resolver: zodResolver(newDraftInputSchema),
    defaultValues: { slug, title: initial.title, contentSource: initial.contentSource },
  });

  const contentSource = watch('contentSource');

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        save.mutate(data);
      })}
      className="space-y-md"
    >
      {serverError && <Alert>{serverError}</Alert>}
      <input type="hidden" {...register('slug')} />
      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-sm">Title</label>
        <Input id="title" {...register('title')} />
        {errors.title && <p className="text-danger text-sm mt-xs">{errors.title.message}</p>}
      </div>
      <div>
        <label htmlFor="content" className="block text-sm font-medium mb-sm">Content</label>
        <MarkdownEditor
          value={contentSource}
          onChange={(v) => setValue('contentSource', v, { shouldValidate: true })}
          placeholder="Edit page content..."
          disabled={save.isPending}
          aria-label="Page content"
        />
        {errors.contentSource && <p className="text-danger text-sm mt-xs">{errors.contentSource.message}</p>}
      </div>
      <div className="flex items-center gap-md">
        <Button type="submit" disabled={isSubmitting || save.isPending}>
          {save.isPending ? 'Saving draft...' : 'Save new draft'}
        </Button>
        {initial.canPublish && <PublishButton slug={slug} version={initial.latestVersion} />}
      </div>
    </form>
  );
}
