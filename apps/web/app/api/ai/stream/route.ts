import { NextRequest } from "next/server";
import { getSession, buildPermissionContext } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = (await req.json()) as {
    conversationId?: string;
    userMessage?: string;
    contextType?: string;
    contextId?: string;
    mode?: string;
  };

  if (!body.conversationId || !body.userMessage) {
    return new Response(JSON.stringify({ error: "conversationId and userMessage required" }), {
      status: 400,
    });
  }

  const actor = await buildPermissionContext(session.user.id);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };

      try {
        const { streamAnswer } = await import(
          "@/server/services/ai/answer-service"
        );
        for await (const chunk of streamAnswer({
          conversationId: body.conversationId!,
          userMessage: body.userMessage!,
          actor,
        })) {
          send(chunk);
          if (chunk.type === "done" || chunk.type === "error") break;
        }
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Internal error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
