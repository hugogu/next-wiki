import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
import { RawContentRenderer } from '@/components/pages/raw-content/RawContentRenderer';
import { ConversationStatusBadge } from '@/components/chat/ConversationSessionView';
import { PageMetadata } from '@/components/pages/PageMetadata';
import { PageSidebar } from '@/components/pages/PageSidebar';
import { ProvenanceIndicators } from '@/components/pages/ProvenanceIndicators';
import { PublishLinkButton } from '@/components/pages/PublishLinkButton';
import { extractHeadings, injectHeadingIds } from '@/lib/html';
import { getSpaceHref, type ReaderSpace } from '@/lib/path';
import { getCurrentActor } from '@/server/services/auth';
import * as publicContent from '@/server/services/public-content';
import { getCategorySystemKeyById } from '@/server/services/raw-categories';
import { getLatestConversationSnapshot } from '@/server/services/raw-conversations';
import { isLlmWikiMode } from '@/server/services/writing-mode';
import { renderMarkdown } from '@/server/pipeline';
import { getDictionary, getStaticLocale } from '@/i18n/server';
import { createAppFormatter } from '@/i18n/formatter';

export const dynamic = 'force-dynamic';

type Params = Promise<{ space: string; path?: string[] }>;

function asPrivateSpace(value: string): Exclude<ReaderSpace, 'wiki'> | null {
  return value === 'raw' || value === 'generated' ? value : null;
}

function spaceLabel(
  t: ReturnType<typeof getDictionary>,
  space: Exclude<ReaderSpace, 'wiki'>,
): string {
  return space === 'raw' ? t('layout.nav.spaces.raw') : t('layout.nav.spaces.generated');
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [resolved, locale] = await Promise.all([params, getStaticLocale()]);
  const t = getDictionary(locale);
  const space = asPrivateSpace(resolved.space);
  const path = resolved.path?.map(decodeURIComponent).join('/') ?? '';
  return { title: path || (space ? spaceLabel(t, space) : t('page.error.notFound')) };
}

export default async function SpaceReaderPage({ params }: { params: Params }) {
  const [resolved, actor, locale] = await Promise.all([params, getCurrentActor(), getStaticLocale()]);
  const t = getDictionary(locale);
  const formatter = createAppFormatter(locale);
  const space = asPrivateSpace(resolved.space);

  if (!space || actor.kind !== 'user' || actor.role !== 'admin' || !(await isLlmWikiMode())) {
    notFound();
  }

  const segments = resolved.path?.map(decodeURIComponent) ?? [];
  const path = segments.join('/');

  if (!path) {
    return (
      <Layout space={space}>
        <div className="min-h-full px-lg py-2xl">
          <h1 className="font-display text-2xl font-semibold">{spaceLabel(t, space)}</h1>
          <p className="mt-sm text-muted">{t('space.reader.empty')}</p>
        </div>
      </Layout>
    );
  }

  const page = await publicContent.getPageByPath({ actor }, path, ['latestRevision'], space);
  if (!page || page.status === 'deleted') notFound();

  const bodyHtml = injectHeadingIds(renderMarkdown(page.contentSource ?? '').html);
  const headings = extractHeadings(bodyHtml);
  const createdAt = new Date(page.createdAt);
  const latestRevision = page.latestRevision;
  // Raw entries dispatch their renderer by content type from the current
  // revision (which also carries the original-bytes reference for viewers).
  const rawRevision = space === 'raw'
    ? await publicContent.getRevision({ actor }, page.id, latestRevision?.version ?? page.publishedRevision?.version ?? 1)
    : null;
  // 023: dispatch to the shared conversation view for the built-in
  // Conversation category. The snapshot is read from the current published
  // revision (not re-derived from live events), so it matches whatever the
  // capture worker last committed.
  const rawCategorySystemKey = rawRevision?.categoryId
    ? await getCategorySystemKeyById(rawRevision.categoryId)
    : null;
  const conversation = rawCategorySystemKey === 'conversation'
    ? await getLatestConversationSnapshot(page.id)
    : null;
  const status = latestRevision?.status === 'draft' ? 'draft' : page.status;
  const pageContext = {
    pageId: page.id,
    revisionId: latestRevision?.id,
    path: page.path,
    title: page.title,
    status,
    canEdit: space === 'generated',
    canPublish: space === 'generated' && latestRevision?.status === 'draft' && latestRevision.canPublish,
    version: latestRevision?.version ?? page.publishedRevision?.version ?? 1,
    space,
    date: page.metadata?.date ?? null,
    summary: page.metadata?.summary ?? null,
  };
  const canPublishAsLink = space === 'generated' && page.status === 'published';

  return (
    <Layout pageContext={pageContext} space={space}>
      <div className="min-h-full flex flex-col">
        {status === 'draft' && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-lg py-sm text-sm">
            {t('page.read.draftBanner')}
          </div>
        )}
        <div className="grid min-w-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <article className="page-reader-article relative mx-auto w-full min-w-0 max-w-5xl px-lg py-md" data-testid="space-page-reader">
            {canPublishAsLink && (
              <div className="absolute right-lg top-md z-10">
                <PublishLinkButton pageId={page.id} targetTitle={page.title} currentPath={page.path} />
              </div>
            )}
            <nav
              aria-label={t('space.reader.breadcrumbs')}
              className={`mb-lg flex flex-wrap items-center gap-xs text-sm text-muted ${canPublishAsLink ? 'pr-12' : ''}`}
            >
              <Link className="hover:text-foreground" href={getSpaceHref(space)}>{spaceLabel(t, space)}</Link>
              {segments.map((segment, index) => {
                const segmentPath = segments.slice(0, index + 1).join('/');
                const isCurrent = index === segments.length - 1;
                return (
                  <span key={segmentPath} className="flex items-center gap-xs">
                    <span aria-hidden="true">/</span>
                    {isCurrent ? (
                      <span className="text-foreground" aria-current="page">{segment}</span>
                    ) : (
                      <Link className="hover:text-foreground" href={getSpaceHref(space, segmentPath)}>{segment}</Link>
                    )}
                  </span>
                );
              })}
              <ProvenanceIndicators pageId={page.id} className="flex items-center gap-xs" />
              {conversation && <ConversationStatusBadge status={conversation.status} className="ml-auto" />}
            </nav>
            <PageMetadata
              date={page.metadata?.date ?? null}
              summary={page.metadata?.summary ?? null}
              tags={[]}
              labels={{
                date: t('page.metadata.date'),
                summary: t('page.metadata.summary'),
                tags: t('page.metadata.tags'),
              }}
            />
            {space === 'raw' && rawRevision ? (
              <RawContentRenderer
                contentType={rawRevision.contentType}
                contentSource={rawRevision.contentSource ?? page.contentSource ?? ''}
                originalAssetId={rawRevision.originalAsset?.id ?? null}
                markdownHtml={bodyHtml}
                labels={{
                  download: t('space.reader.raw.download'),
                  pdfTitle: t('space.reader.raw.pdfTitle'),
                  imageAlt: t('space.reader.raw.imageAlt'),
                  noViewer: t('space.reader.raw.noViewer'),
                  invalidConversation: t('space.reader.raw.invalidConversation'),
                }}
                rawCategorySystemKey={rawCategorySystemKey}
                conversation={conversation}
                showConversationStatus={false}
              />
            ) : (
              <ContentRenderer html={bodyHtml} />
            )}
            <footer className="mt-2xl pt-md border-t border-border text-sm text-muted">
              {t('page.read.createdOn', { date: formatter.dateTime(createdAt, 'short') })}
              {t('page.read.authorSuffix', { name: page.author.displayName ?? t('common.unknownAuthor') })}
            </footer>
          </article>
          <PageSidebar
            headings={headings}
            tags={page.metadata?.tags ?? []}
            tagsLabel={t('page.metadata.tags')}
            outlineLabel={t('page.read.outline')}
          />
        </div>
      </div>
    </Layout>
  );
}
