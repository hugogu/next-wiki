import { NextRequest, NextResponse } from "next/server";
import { handleRestError } from "@/server/rest/error-handler";
import { getSession, buildPermissionContext } from "@/server/auth/session";
import { UnauthorizedError, ForbiddenError } from "@next-wiki/shared";

async function getAdminActor(req: NextRequest) {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  const actor = await buildPermissionContext(session.user.id);
  if (!actor.isAdmin) throw new ForbiddenError("admin access");
  return actor;
}

// Dispatches all /admin/* paths
export async function handleAdminRoute(req: NextRequest, path: string): Promise<NextResponse> {
  try {
    const actor = await getAdminActor(req);
    const url = new URL(req.url);

    // /admin/users[/:id[/groups]]
    if (path.startsWith("/admin/users")) {
      const { listUsers, getUser, updateUserStatus, getUserGroups } = await import(
        "@/server/services/admin/users-service"
      );
      const segs = path.replace(/^\/admin\/users\/?/, "").split("/").filter(Boolean);
      const userId = segs[0];

      if (!userId && req.method === "GET") {
        const result = await listUsers(
          {
            q: url.searchParams.get("q") ?? undefined,
            status: url.searchParams.get("status") ?? undefined,
            page: Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10)),
            limit: Math.min(100, parseInt(url.searchParams.get("limit") ?? "20", 10)),
          },
          actor,
        );
        return NextResponse.json({ success: true, data: result });
      }
      if (userId && segs[1] === "groups" && req.method === "GET") {
        return NextResponse.json({ success: true, data: await getUserGroups(userId, actor) });
      }
      if (userId && req.method === "GET") {
        return NextResponse.json({ success: true, data: await getUser(userId, actor) });
      }
      if (userId && req.method === "PATCH") {
        const body = await req.json();
        return NextResponse.json({ success: true, data: await updateUserStatus(userId, body.status, actor) });
      }
    }

    // /admin/groups[/:id[/members[/:memberId]]]
    if (path.startsWith("/admin/groups")) {
      const {
        listGroups, createGroup, updateGroup, deleteGroup,
        addGroupMember, removeGroupMember, listGroupMembers,
      } = await import("@/server/services/admin/groups-service");
      const segs = path.replace(/^\/admin\/groups\/?/, "").split("/").filter(Boolean);
      const groupId = segs[0];

      if (!groupId && req.method === "GET") return NextResponse.json({ success: true, data: await listGroups(actor) });
      if (!groupId && req.method === "POST") {
        const body = await req.json();
        return NextResponse.json({ success: true, data: await createGroup(body, actor) }, { status: 201 });
      }
      if (groupId && segs[1] === "members") {
        const memberId = segs[2];
        if (req.method === "GET") return NextResponse.json({ success: true, data: await listGroupMembers(groupId, actor) });
        if (req.method === "POST") { const b = await req.json(); await addGroupMember(groupId, b.userId, actor); return NextResponse.json({ success: true }); }
        if (req.method === "DELETE" && memberId) { await removeGroupMember(groupId, memberId, actor); return NextResponse.json({ success: true }); }
      }
      if (groupId && req.method === "PATCH") { const b = await req.json(); return NextResponse.json({ success: true, data: await updateGroup(groupId, b, actor) }); }
      if (groupId && req.method === "DELETE") { await deleteGroup(groupId, actor); return NextResponse.json({ success: true }); }
    }

    // /admin/permissions
    if (path.startsWith("/admin/permissions")) {
      return NextResponse.json({ success: true, data: [] });
    }

    // /admin/auth-providers[/:key]
    if (path.startsWith("/admin/auth-providers")) {
      const { listAuthProviders, createAuthProvider, updateAuthProvider, setAuthProviderStatus, deleteAuthProvider } =
        await import("@/server/services/auth/provider-service");
      const key = path.replace(/^\/admin\/auth-providers\/?/, "").split("/")[0];

      if (!key && req.method === "GET") return NextResponse.json({ success: true, data: await listAuthProviders(actor) });
      if (!key && req.method === "POST") { const b = await req.json(); return NextResponse.json({ success: true, data: await createAuthProvider(b, actor) }, { status: 201 }); }
      if (key && req.method === "PATCH") {
        const b = await req.json();
        if (b.status) return NextResponse.json({ success: true, data: await setAuthProviderStatus(key, b.status, actor) });
        return NextResponse.json({ success: true, data: await updateAuthProvider(key, b, actor) });
      }
      if (key && req.method === "DELETE") { await deleteAuthProvider(key, actor); return NextResponse.json({ success: true }); }
    }

    // /admin/api-tokens[/:id]
    if (path.startsWith("/admin/api-tokens")) {
      const { createApiToken, listApiTokens, revokeApiToken } = await import(
        "@/server/services/admin/api-token-service"
      );
      const tokenId = path.replace(/^\/admin\/api-tokens\/?/, "").split("/")[0];

      if (!tokenId && req.method === "GET") return NextResponse.json({ success: true, data: await listApiTokens(actor) });
      if (!tokenId && req.method === "POST") { const b = await req.json(); return NextResponse.json({ success: true, data: await createApiToken(b, actor) }, { status: 201 }); }
      if (tokenId && req.method === "DELETE") { await revokeApiToken(tokenId, actor); return NextResponse.json({ success: true }); }
    }

    // /admin/themes[/:id[/activate]]
    if (path.startsWith("/admin/themes")) {
      const { handleAdminThemesRoute } = await import("@/server/rest/routes/admin-themes");
      return handleAdminThemesRoute(req, path, actor);
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return handleRestError(err);
  }
}
