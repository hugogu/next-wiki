'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPageInputSchema, type CreatePageInput } from '@next-wiki/shared';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';

export function CreatePageForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const create = trpc.pages.create.useMutation({
    onSuccess: (_data, vars) => {
      router.push(`/${vars.slug}`);
      window.location.href = `/${vars.slug}`;
    },
    onError: (err) => {
      if (err.data?.code === 'CONFLICT') {
        setServerError('A page with this slug already exists.');
      } else if (err.data?.code === 'FORBIDDEN' || err.data?.code === 'UNAUTHORIZED') {
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
    defaultValues: { slug: '', title: '', contentSource: '' },
  });

  const contentSource = watch('contentSource');

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        create.mutate(data);
      })}
      className="space-y-md"
    >
      {serverError && (
        <div className="p-md bg-danger/10 text-danger rounded-md text-sm" role="alert">
          {serverError}
        </div>
      )}
      <div>
        <label htmlFor="slug" className="block text-sm font-medium mb-sm">Slug</label>
        <Input id="slug" {...register('slug')} />
        {errors.slug && <p className="text-danger text-sm mt-xs">{errors.slug.message}</p>}
      </div>
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
          placeholder="Write your page content in Markdown..."
          disabled={create.isPending}
        />
        {errors.contentSource && <p className="text-danger text-sm mt-xs">{errors.contentSource.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting || create.isPending}>
        {create.isPending ? 'Saving draft...' : 'Save draft'}
      </Button>
    </form>
  );
}
