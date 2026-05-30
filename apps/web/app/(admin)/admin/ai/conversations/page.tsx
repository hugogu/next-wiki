import { requireAdmin } from "@/server/auth/authorize";
import { getSession, buildPermissionContext } from "@/server/auth/session";

export const metadata = { title: "AI Conversations — Admin" };
export const dynamic = "force-dynamic";

export default async function AiConversationsPage() {
  await requireAdmin();
  const session = await getSession();
  const actor = await buildPermissionContext(session?.user.id ?? null);
  const { listConversations } = await import(
    "@/server/services/ai/conversation-service"
  );

  const conversations = await listConversations(actor, { includeAll: true });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">All Conversations</h1>
        <a href="/admin/ai" className="text-sm text-link hover:underline">
          ← AI Providers
        </a>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded border border-border bg-white p-8 text-center text-text-muted">
          No conversations yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-neutral-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-text-secondary">Title</th>
                <th className="px-4 py-2 text-left font-medium text-text-secondary">User</th>
                <th className="px-4 py-2 text-left font-medium text-text-secondary">Context</th>
                <th className="px-4 py-2 text-left font-medium text-text-secondary">Status</th>
                <th className="px-4 py-2 text-left font-medium text-text-secondary">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {conversations.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 text-text-primary">
                    {c.title ?? <span className="text-text-muted italic">Untitled</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-text-muted">{c.userId}</td>
                  <td className="px-4 py-2 text-text-secondary">
                    {c.contextType}
                    {c.contextId ? `: ${c.contextId}` : ""}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        c.status === "active"
                          ? "bg-success-50 text-success-700"
                          : "bg-neutral-100 text-text-muted"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-text-muted">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
