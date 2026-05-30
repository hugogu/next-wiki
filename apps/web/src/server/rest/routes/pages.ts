import { NextRequest, NextResponse } from "next/server";
import { handleRestError } from "@/server/rest/error-handler";
import { getSession, buildPermissionContext } from "@/server/auth/session";
import { UnauthorizedError } from "@next-wiki/shared";

// Route: /api/v1/pages/:spaceKey/...pagePath[?locale=en]
// Handles: GET (read), POST (create), PATCH (update)
// Sub-resources: /revisions, /revisions/:id/restore
export async function handlePagesRoute(req: NextRequest, path: string): Promise<NextResponse> {
  try {
    const session = await getSession();
    const actor = await buildPermissionContext(session?.user.id ?? null);
    const url = new URL(req.url);
    const locale = url.searchParams.get("locale") ?? "en";

    // Strip /pages/ prefix and parse segments
    const trimmed = path.replace(/^\/pages\//, "");
    const segments = trimmed.split("/").filter(Boolean);
    const spaceKey = segments[0];
    if (!spaceKey) return NextResponse.json({ error: "Missing spaceKey" }, { status: 400 });

    const revIdx = segments.indexOf("revisions");
    const pagePathSegments = revIdx === -1 ? segments.slice(1) : segments.slice(1, revIdx);
    const pagePath = "/" + pagePathSegments.join("/");

    if (revIdx === -1) {
      return await handlePageCrud(req, spaceKey, pagePath, locale, actor, session);
    }

    const afterRevisions = segments.slice(revIdx + 1);
    return await handleRevisions(req, spaceKey, pagePath, locale, afterRevisions, actor, session);
  } catch (err) {
    return handleRestError(err);
  }
}

async function handlePageCrud(
  req: NextRequest,
  spaceKey: string,
  pagePath: string,
  locale: string,
  actor: any,
  session: any,
): Promise<NextResponse> {
  const { getPage, createPage, updatePage, deletePage } = await import(
    "@/server/services/wiki/page-service"
  );

  if (req.method === "GET") {
    const page = await getPage(spaceKey, pagePath, locale, actor);
    return NextResponse.json({ success: true, data: page });
  }
  if (req.method === "POST") {
    if (!session) throw new UnauthorizedError();
    const body = await req.json();
    const page = await createPage({ ...body, spaceKey }, actor);
    return NextResponse.json({ success: true, data: page }, { status: 201 });
  }
  if (req.method === "PATCH") {
    if (!session) throw new UnauthorizedError();
    const body = await req.json();
    const page = await getPage(spaceKey, pagePath, locale, actor);
    const updated = await updatePage(page.id, body, actor);
    return NextResponse.json({ success: true, data: updated });
  }
  if (req.method === "DELETE") {
    if (!session) throw new UnauthorizedError();
    const page = await getPage(spaceKey, pagePath, locale, actor);
    await deletePage(page.id, actor);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

async function handleRevisions(
  req: NextRequest,
  spaceKey: string,
  pagePath: string,
  locale: string,
  afterRevisions: string[],
  actor: any,
  session: any,
): Promise<NextResponse> {
  const { getPage, listPageRevisions, getRevision, restoreRevision, diffRevisions } =
    await import("@/server/services/wiki/page-service");

  const page = await getPage(spaceKey, pagePath, locale, actor);
  const revisionId = afterRevisions[0];
  const subAction = afterRevisions[1];

  if (!revisionId && req.method === "GET") {
    const revisions = await listPageRevisions(page.id, actor);
    return NextResponse.json({ success: true, data: revisions });
  }

  if (revisionId && !subAction && req.method === "GET") {
    const revision = await getRevision(revisionId, actor);
    return NextResponse.json({ success: true, data: revision });
  }

  if (revisionId && subAction === "restore" && req.method === "POST") {
    if (!session) throw new UnauthorizedError();
    const { restoreRevision: restore } = await import("@/server/services/wiki/page-service");
    const result = await restore(page.id, revisionId, actor);
    return NextResponse.json({ success: true, data: result });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function handleSearchRoute(req: NextRequest, _path: string): Promise<NextResponse> {
  try {
    const session = await getSession();
    const actor = await buildPermissionContext(session?.user.id ?? null);
    const url = new URL(req.url);
    const q = url.searchParams.get("q");

    if (!q) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "q is required" } }, { status: 400 });

    const { searchPages } = await import("@/server/services/search/query-service");
    const result = await searchPages({
      q,
      spaceKey: url.searchParams.get("spaceKey") ?? undefined,
      locale: url.searchParams.get("locale") ?? undefined,
      tagSlugs: url.searchParams.getAll("tag"),
      page: parseInt(url.searchParams.get("page") ?? "1", 10),
      limit: parseInt(url.searchParams.get("limit") ?? "20", 10),
      actor,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return handleRestError(err);
  }
}

export async function handleAssetsRoute(req: NextRequest, path: string): Promise<NextResponse> {
  try {
    const session = await getSession();
    const actor = await buildPermissionContext(session?.user.id ?? null);
    const segments = path.replace(/^\/assets\//, "").split("/");
    const assetId = segments[0];

    if (!assetId) return NextResponse.json({ error: "Missing assetId" }, { status: 400 });

    if (segments[1] === "content" && req.method === "GET") {
      const { getAssetContent } = await import("@/server/services/assets/asset-service");
      const { buffer, mimeType, filename } = await getAssetContent(assetId, actor);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `inline; filename="${filename}"`,
        },
      });
    }

    if (req.method === "GET") {
      const { getAsset } = await import("@/server/services/assets/asset-service");
      const asset = await getAsset(assetId, actor);
      return NextResponse.json({ success: true, data: asset });
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return handleRestError(err);
  }
}

export async function handleAdminRoute(_req: NextRequest, _path: string): Promise<NextResponse> {
  return NextResponse.json({ message: "Implemented in Phase 4 (US2)" }, { status: 501 });
}

export async function handleAiRoute(_req: NextRequest, _path: string): Promise<NextResponse> {
  return NextResponse.json({ message: "Implemented in Phase 6 (US4)" }, { status: 501 });
}
