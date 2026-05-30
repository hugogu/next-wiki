import { requireAdmin } from "@/server/auth/authorize";
import { listGroups } from "@/server/services/admin/groups-service";

export const metadata = { title: "Groups — Admin" };

export default async function AdminGroupsPage() {
  const actor = await requireAdmin();
  const groups = await listGroups(actor);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Groups</h1>
        <span className="text-sm text-text-muted">{groups.length} groups</span>
      </div>

      <div className="overflow-hidden rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface">
            <tr>
              {["Key", "Name", "System", "Description"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((group: any) => (
              <tr key={group.id} className="hover:bg-surface">
                <td className="px-3 py-2 font-mono text-xs">{group.key}</td>
                <td className="px-3 py-2 font-medium">{group.name}</td>
                <td className="px-3 py-2">
                  {group.isSystem && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                      system
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-text-muted">{group.description ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
