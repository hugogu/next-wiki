import { requireAdmin } from "@/server/auth/authorize";
import { listUsers } from "@/server/services/admin/users-service";

export const metadata = { title: "Users — Admin" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const actor = await requireAdmin();
  const { q, status, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));

  const result = await listUsers({ q, status, page, limit: 30 }, actor);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Users</h1>
        <span className="text-sm text-text-muted">{result.total} total</span>
      </div>

      {/* Search */}
      <form method="GET" className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by email or name…"
          className="flex-1 rounded border border-border px-3 py-1.5 text-sm"
        />
        <select name="status" defaultValue={status} className="rounded border border-border px-2 py-1.5 text-sm">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="invited">Invited</option>
        </select>
        <button type="submit" className="rounded bg-primary-600 px-3 py-1.5 text-sm text-white">
          Search
        </button>
      </form>

      <div className="overflow-hidden rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface">
            <tr>
              {["Email", "Name", "Status", "Joined"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.items.map((user: any) => (
              <tr key={user.id} className="hover:bg-surface">
                <td className="px-3 py-2">{user.email ?? "—"}</td>
                <td className="px-3 py-2 font-medium">{user.name}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.status === "active"
                        ? "bg-success-100 text-success-700"
                        : user.status === "suspended"
                          ? "bg-danger-100 text-danger-700"
                          : "bg-neutral-100 text-neutral-700"
                    }`}
                  >
                    {user.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-text-muted">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
