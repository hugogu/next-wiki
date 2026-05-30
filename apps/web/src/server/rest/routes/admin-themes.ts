import { NextRequest, NextResponse } from "next/server";
import { handleRestError } from "@/server/rest/error-handler";
import type { PermissionContext } from "@/server/services/permissions/context";

// Handles /admin/themes[/:id[/activate]]
export async function handleAdminThemesRoute(
  req: NextRequest,
  path: string,
  actor: PermissionContext,
): Promise<NextResponse> {
  try {
    const {
      listThemes,
      getTheme,
      createTheme,
      updateTheme,
      activateTheme,
      deleteTheme,
    } = await import("@/server/services/themes/theme-service");

    const segs = path.replace(/^\/admin\/themes\/?/, "").split("/").filter(Boolean);
    const id = segs[0];
    const sub = segs[1];

    if (!id && req.method === "GET")
      return NextResponse.json({ success: true, data: await listThemes(actor) });

    if (!id && req.method === "POST") {
      const body = (await req.json()) as { key: string; name: string; tokenSet?: Record<string, unknown> };
      return NextResponse.json({ success: true, data: await createTheme(body, actor) }, { status: 201 });
    }

    if (id && sub === "activate" && req.method === "POST")
      return NextResponse.json({ success: true, data: await activateTheme(id, actor) });

    if (id && req.method === "GET")
      return NextResponse.json({ success: true, data: await getTheme(id, actor) });

    if (id && req.method === "PATCH") {
      const body = (await req.json()) as { name?: string; tokenSet?: Record<string, unknown> };
      return NextResponse.json({ success: true, data: await updateTheme(id, body, actor) });
    }

    if (id && req.method === "DELETE") {
      await deleteTheme(id, actor);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return handleRestError(err);
  }
}
