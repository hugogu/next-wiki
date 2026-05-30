import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public REST API v1 dispatcher.
// Routes are matched by path prefix and dispatched to the appropriate handler.
async function dispatch(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/^\/api\/v1/, "");

  try {
    // Lazy-load route handlers to keep this entry thin.
    if (pathname.startsWith("/pages")) {
      const { handlePagesRoute } = await import("@/server/rest/routes/pages");
      return handlePagesRoute(req, pathname);
    }
    if (pathname.startsWith("/search")) {
      const { handleSearchRoute } = await import("@/server/rest/routes/search");
      return handleSearchRoute(req, pathname);
    }
    if (pathname.startsWith("/assets")) {
      const { handleAssetsRoute } = await import("@/server/rest/routes/assets");
      return handleAssetsRoute(req, pathname);
    }
    if (pathname.startsWith("/admin")) {
      const { handleAdminRoute } = await import("@/server/rest/routes/admin-users");
      return handleAdminRoute(req, pathname);
    }
    if (pathname.startsWith("/ai")) {
      const { handleAiRoute } = await import("@/server/rest/routes/ai");
      return handleAiRoute(req, pathname);
    }
    if (pathname.startsWith("/setup")) {
      const { handleSetupRoute } = await import("@/server/rest/routes/setup");
      return handleSetupRoute(req, pathname);
    }
    if (pathname === "/openapi" || pathname === "/openapi.json") {
      const { handleOpenApiRoute } = await import("@/server/rest/routes/openapi");
      return handleOpenApiRoute(req);
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    const { handleRestError } = await import("@/server/rest/error-handler");
    return handleRestError(err);
  }
}

export { dispatch as GET, dispatch as POST, dispatch as PUT, dispatch as PATCH, dispatch as DELETE };
