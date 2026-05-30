import { getDb } from "@/server/db/client";
import { users, groups, pages, backgroundTasks } from "@/server/db/schema/auth";
import { pages as wikiPages } from "@/server/db/schema/wiki";
import { eq, count, and, isNull } from "drizzle-orm";

export const metadata = { title: "Admin Dashboard — next-wiki" };

export default async function AdminDashboardPage() {
  const db = getDb();

  const [userCount, groupCount, pageCount, pendingTaskCount] = await Promise.allSettled([
    db.select({ c: count() }).from(users).then((r) => r[0]?.c ?? 0),
    db.select({ c: count() }).from(groups).then((r) => r[0]?.c ?? 0),
    db
      .select({ c: count() })
      .from(wikiPages)
      .where(eq(wikiPages.status, "published"))
      .then((r) => r[0]?.c ?? 0),
    db
      .select({ c: count() })
      .from(backgroundTasks)
      .where(eq(backgroundTasks.status, "queued"))
      .then((r) => r[0]?.c ?? 0),
  ]).then((results) => results.map((r) => (r.status === "fulfilled" ? r.value : 0)));

  const stats = [
    { label: "Users", value: userCount, href: "/admin/users" },
    { label: "Groups", value: groupCount, href: "/admin/groups" },
    { label: "Published Pages", value: pageCount, href: "/" },
    { label: "Queued Tasks", value: pendingTaskCount, href: "/admin/tasks" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-text-primary">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, href }) => (
          <a
            key={label}
            href={href}
            className="rounded border border-border bg-white p-4 hover:border-primary-300"
          >
            <div className="text-2xl font-bold text-text-primary">{String(value)}</div>
            <div className="text-sm text-text-muted">{label}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
