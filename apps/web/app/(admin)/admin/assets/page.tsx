import { getDb } from "@/server/db/client";
import { assets } from "@/server/db/schema/wiki";
import { desc } from "drizzle-orm";

export const metadata = { title: "Assets — Admin" };

const BYTES_UNITS = ["B", "KB", "MB", "GB"] as const;
function formatBytes(bytes: number): string {
  let val = bytes;
  let unitIdx = 0;
  while (val >= 1024 && unitIdx < BYTES_UNITS.length - 1) {
    val /= 1024;
    unitIdx++;
  }
  return `${val.toFixed(1)} ${BYTES_UNITS[unitIdx]}`;
}

export default async function AdminAssetsPage() {
  const db = getDb();
  const allAssets = await db
    .select()
    .from(assets)
    .orderBy(desc(assets.createdAt))
    .limit(200);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Assets</h1>
        <span className="text-sm text-text-muted">{allAssets.length} files</span>
      </div>

      {allAssets.length === 0 ? (
        <p className="text-text-muted">No assets uploaded yet.</p>
      ) : (
        <div className="overflow-hidden rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                {["Filename", "Type", "Kind", "Size", "Uploaded"].map((h) => (
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
              {allAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-surface">
                  <td className="px-3 py-2">
                    <a
                      href={`/api/v1/assets/${asset.id}/content`}
                      className="text-link hover:underline"
                      target="_blank"
                      rel="noopener"
                    >
                      {asset.originalFilename}
                    </a>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{asset.mimeType}</td>
                  <td className="px-3 py-2 text-text-muted">{asset.kind}</td>
                  <td className="px-3 py-2 text-text-muted">
                    {formatBytes(Number(asset.byteSize))}
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {asset.createdAt ? new Date(asset.createdAt).toLocaleDateString() : "—"}
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
