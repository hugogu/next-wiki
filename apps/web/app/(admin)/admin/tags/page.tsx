import { getDb } from "@/server/db/client";
import { tags } from "@/server/db/schema/wiki";
import { desc } from "drizzle-orm";

export const metadata = { title: "Tags — Admin" };

export default async function AdminTagsPage() {
  const db = getDb();
  const allTags = await db.select().from(tags).orderBy(tags.label).limit(500);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Tags</h1>
        <span className="text-sm text-text-muted">{allTags.length} total</span>
      </div>

      {allTags.length === 0 ? (
        <p className="text-text-muted">No tags created yet.</p>
      ) : (
        <div className="overflow-hidden rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                {["Slug", "Label", "Description", "Created"].map((h) => (
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
              {allTags.map((tag) => (
                <tr key={tag.id} className="hover:bg-surface">
                  <td className="px-3 py-2 font-mono text-xs">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5">#{tag.slug}</span>
                  </td>
                  <td className="px-3 py-2 font-medium">{tag.label}</td>
                  <td className="px-3 py-2 text-text-muted">{tag.description ?? "—"}</td>
                  <td className="px-3 py-2 text-text-muted">
                    {tag.createdAt ? new Date(tag.createdAt).toLocaleDateString() : "—"}
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
