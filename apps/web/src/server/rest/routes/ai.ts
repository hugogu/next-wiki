import { NextRequest, NextResponse } from "next/server";
import { getSession, buildPermissionContext } from "@/server/auth/session";
import { handleRestError } from "@/server/rest/error-handler";

export async function handleAiRoute(req: NextRequest, path: string): Promise<NextResponse> {
  const session = await getSession();
  const actor = await buildPermissionContext(session?.user.id ?? null);

  try {
    // /ai/providers[/:id[/check]]
    if (path.startsWith("/ai/providers")) {
      const {
        listProviders,
        getProvider,
        createProvider,
        updateProvider,
        deleteProvider,
        setProviderStatus,
        checkProviderHealth,
      } = await import("@/server/services/ai/provider-service");

      const rest = path.replace(/^\/ai\/providers\/?/, "");
      const segments = rest.split("/").filter(Boolean);
      const id = segments[0];
      const action = segments[1];

      if (action === "check" && id && req.method === "POST") {
        const result = await checkProviderHealth(id, actor);
        return NextResponse.json({ success: true, data: result });
      }
      if (!id && req.method === "GET") {
        return NextResponse.json({ success: true, data: await listProviders(actor) });
      }
      if (!id && req.method === "POST") {
        const b = await req.json();
        return NextResponse.json(
          { success: true, data: await createProvider(b, actor) },
          { status: 201 },
        );
      }
      if (id && req.method === "GET") {
        return NextResponse.json({ success: true, data: await getProvider(id, actor) });
      }
      if (id && (req.method === "PUT" || req.method === "PATCH")) {
        const b = await req.json();
        if (b.status !== undefined) {
          return NextResponse.json({
            success: true,
            data: await setProviderStatus(id, b.status, actor),
          });
        }
        return NextResponse.json({ success: true, data: await updateProvider(id, b, actor) });
      }
      if (id && req.method === "DELETE") {
        await deleteProvider(id, actor);
        return new NextResponse(null, { status: 204 });
      }
    }

    // /ai/conversations[/:id[/messages]]
    if (path.startsWith("/ai/conversations")) {
      const {
        listConversations,
        getConversation,
        createConversation,
        deleteConversation,
      } = await import("@/server/services/ai/conversation-service");
      const { listMessages } = await import("@/server/services/ai/message-service");

      const rest = path.replace(/^\/ai\/conversations\/?/, "");
      const segments = rest.split("/").filter(Boolean);
      const id = segments[0];
      const sub = segments[1];

      if (sub === "messages" && id && req.method === "GET") {
        return NextResponse.json({ success: true, data: await listMessages(id, actor) });
      }
      if (!id && req.method === "GET") {
        return NextResponse.json({ success: true, data: await listConversations(actor) });
      }
      if (!id && req.method === "POST") {
        const b = await req.json();
        return NextResponse.json(
          { success: true, data: await createConversation(b, actor) },
          { status: 201 },
        );
      }
      if (id && req.method === "GET") {
        return NextResponse.json({ success: true, data: await getConversation(id, actor) });
      }
      if (id && req.method === "DELETE") {
        await deleteConversation(id, actor);
        return new NextResponse(null, { status: 204 });
      }
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return handleRestError(err);
  }
}
