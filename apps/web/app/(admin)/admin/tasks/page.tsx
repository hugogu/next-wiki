import { getDb } from "@/server/db/client";
import { backgroundTasks } from "@/server/db/schema/auth";
import { desc, eq } from "drizzle-orm";

export const metadata = { title: "Background Tasks — Admin" };

const statusColors: Record<string, string> = {
  queued: "bg-neutral-100 text-neutral-700",
  running: "bg-primary-100 text-primary-700",
  completed: "bg-success-100 text-success-700",
  failed: "bg-danger-100 text-danger-700",
  cancelled: "bg-neutral-100 text-neutral-500",
};

export default async function AdminTasksPage() {
  const db = getDb();
  const tasks = await db
    .select()
    .from(backgroundTasks)
    .orderBy(desc(backgroundTasks.createdAt))
    .limit(100);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-text-primary">Background Tasks</h1>
      {tasks.length === 0 ? (
        <p className="text-text-muted">No background tasks recorded yet.</p>
      ) : (
        <div className="overflow-hidden rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                {["Type", "Status", "Progress", "Created", "Finished"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-surface">
                  <td className="px-3 py-2 font-mono text-xs">{task.taskType}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[task.status] ?? ""}`}
                    >
                      {task.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text-muted">{task.progressLabel ?? "—"}</td>
                  <td className="px-3 py-2 text-text-muted">
                    {task.createdAt ? new Date(task.createdAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {task.finishedAt ? new Date(task.finishedAt).toLocaleString() : "—"}
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
