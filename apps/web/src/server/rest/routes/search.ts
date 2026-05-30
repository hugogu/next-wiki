import { NextRequest, NextResponse } from "next/server";
import { handleRestError } from "@/server/rest/error-handler";
import { getSession, buildPermissionContext } from "@/server/auth/session";

export async function handleSearchRoute(req: NextRequest, _path: string): Promise<NextResponse> {
  try {
    const session = await getSession();
    const actor = await buildPermissionContext(session?.user.id ?? null);
    const url = new URL(req.url);
    const q = url.searchParams.get("q");
    if (!q) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "q is required" } },
        { status: 400 },
      );
    }
    const { searchPages } = await import("@/server/services/search/query-service");
    const result = await searchPages({
      q,
      spaceKey: url.searchParams.get("spaceKey") ?? undefined,
      locale: url.searchParams.get("locale") ?? undefined,
      tagSlugs: url.searchParams.getAll("tag"),
      page: Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10)),
      limit: Math.min(100, parseInt(url.searchParams.get("limit") ?? "20", 10)),
      actor,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return handleRestError(err);
  }
}
