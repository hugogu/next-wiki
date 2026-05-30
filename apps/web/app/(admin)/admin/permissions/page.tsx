import { requireAdmin } from "@/server/auth/authorize";
import { getDb } from "@/server/db/client";
import { permissionRules, spaces } from "@/server/db/schema/wiki";
import { desc, eq } from "drizzle-orm";

export const metadata = { title: "Permissions — Admin" };

export default async function AdminPermissionsPage() {
  await requireAdmin();
  const db = getDb();
  const rules = await db
    .select()
    .from(permissionRules)
    .orderBy(permissionRules.resourceType, permissionRules.action)
    .limit(200);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Permission Rules</h1>
        <span className="text-sm text-text-muted">{rules.length} rules</span>
      </div>

      {rules.length === 0 ? (
        <div className="rounded border border-border bg-surface p-6 text-center text-text-muted">
          <p className="mb-1 font-medium">No explicit permission rules configured.</p>
          <p className="text-sm">
            Access is currently controlled by space defaults and group membership.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                {["Effect", "Subject", "Resource", "Action", "Created"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-surface">
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        rule.effect === "allow" ? "bg-success-100 text-success-700" : "bg-danger-100 text-danger-700"
                      }`}
                    >
                      {rule.effect}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {rule.subjectType}/{rule.subjectId.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {rule.resourceType}
                    {rule.resourceId ? `/${rule.resourceId.slice(0, 8)}…` : ""}
                  </td>
                  <td className="px-3 py-2">{rule.action}</td>
                  <td className="px-3 py-2 text-text-muted">
                    {rule.createdAt ? new Date(rule.createdAt).toLocaleDateString() : "—"}
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
