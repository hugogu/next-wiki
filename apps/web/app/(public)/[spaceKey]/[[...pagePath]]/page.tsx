import { notFound, redirect } from "next/navigation";
import { MissingTranslationBanner } from "@/components/common/missing-translation-banner";
import { buildPermissionContext } from "@/server/auth/session";
import { getSession } from "@/server/auth/session";

type Props = {
  params: Promise<{ spaceKey: string; pagePath?: string[] }>;
  searchParams: Promise<{ locale?: string }>;
};

export default async function PageViewRoute({ params, searchParams }: Props) {
  const { spaceKey, pagePath = [] } = await params;
  const { locale: requestedLocale } = await searchParams;

  const session = await getSession();
  const actor = await buildPermissionContext(session?.user.id ?? null);

  const path = "/" + pagePath.join("/") || "/";
  const locale = requestedLocale ?? "en";

  const { getPage } = await import("@/server/services/wiki/page-service");
  const { resolveRedirect } = await import("@/server/services/wiki/redirect-service");
  const { getDb } = await import("@/server/db/client");
  const { spaces } = await import("@/server/db/schema/wiki");
  const { eq } = await import("drizzle-orm");

  // Resolve redirect if page not found at this path.
  const db = getDb();
  const [space] = await db.select().from(spaces).where(eq(spaces.key, spaceKey)).limit(1);
  if (!space) notFound();

  let page;
  let localeFallback: { requested: string; fallback: string } | null = null;

  try {
    page = await getPage(spaceKey, path, locale, actor);
  } catch {
    // Try redirect resolution before 404.
    const redir = await resolveRedirect(space.id, path);
    if (redir) {
      redirect(`/${spaceKey}${redir.toPath}${locale !== "en" ? `?locale=${locale}` : ""}`);
    }

    // Locale fallback: try space default locale.
    if (locale !== space.defaultLocale) {
      try {
        page = await getPage(spaceKey, path, space.defaultLocale, actor);
        localeFallback = { requested: locale, fallback: space.defaultLocale };
      } catch {
        notFound();
      }
    } else {
      notFound();
    }
  }

  const { renderPage } = await import("@/server/pipeline/index");
  let renderedHtml = "";

  if (page.currentRevisionId) {
    const { getRevision } = await import("@/server/services/wiki/page-service");
    const revision = await getRevision(page.currentRevisionId, actor);
    const result = await renderPage(revision.sourceContent, {
      pageId: page.id,
      revisionId: revision.id,
      spaceKey,
      locale: page.locale,
      contentHash: revision.contentHash,
    });
    renderedHtml = result.html;
  }

  return (
    <article className="mx-auto max-w-4xl px-4 py-8">
      {localeFallback && (
        <MissingTranslationBanner
          requestedLocale={localeFallback.requested}
          fallbackLocale={localeFallback.fallback}
        />
      )}
      <h1 className="mb-6 text-3xl font-bold text-text-primary">{page.title}</h1>
      {page.summary && (
        <p className="mb-6 text-lg text-text-secondary">{page.summary}</p>
      )}
      <div
        className="prose prose-slate max-w-none"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </article>
  );
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { spaceKey, pagePath = [] } = await params;
  const { locale = "en" } = await searchParams;
  const path = "/" + pagePath.join("/") || "/";
  const actor = await buildPermissionContext(null);

  try {
    const { getPage } = await import("@/server/services/wiki/page-service");
    const page = await getPage(spaceKey, path, locale, actor);
    return { title: `${page.title} — next-wiki`, description: page.summary ?? undefined };
  } catch {
    return { title: "Page not found — next-wiki" };
  }
}
