import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { desc } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { themes } from "@/server/db/schema/wiki";
import { requireAdmin } from "@/server/auth/authorize";
import { getSession, buildPermissionContext } from "@/server/auth/session";
import { ThemeEditor } from "@/components/admin/theme-editor";
import { ThemePreview } from "@/components/admin/theme-preview";
import type { ThemeTokens } from "@next-wiki/shared";

export const metadata = { title: "Themes — Admin" };
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

async function activateAction(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const session = await getSession();
  const actor = await buildPermissionContext(session?.user.id ?? null);
  const { activateTheme } = await import("@/server/services/themes/theme-service");
  await activateTheme(id, actor);
  revalidatePath("/admin/themes");
}

async function deleteAction(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const session = await getSession();
  const actor = await buildPermissionContext(session?.user.id ?? null);
  const { deleteTheme } = await import("@/server/services/themes/theme-service");
  await deleteTheme(id, actor);
  redirect("/admin/themes");
}

async function saveThemeAction(formData: FormData) {
  "use server";
  const id = (formData.get("id") as string) ?? "";
  const name = formData.get("name") as string;
  const key = (formData.get("key") as string | null) ?? "";
  const tokenSetRaw = formData.get("tokenSet") as string;
  const tokenSet = tokenSetRaw ? (JSON.parse(tokenSetRaw) as Record<string, unknown>) : {};

  const session = await getSession();
  const actor = await buildPermissionContext(session?.user.id ?? null);

  if (id) {
    const { updateTheme } = await import("@/server/services/themes/theme-service");
    await updateTheme(id, { name, tokenSet }, actor);
  } else {
    const { createTheme } = await import("@/server/services/themes/theme-service");
    await createTheme({ key, name, tokenSet }, actor);
  }
  redirect("/admin/themes");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Props = { searchParams: Promise<{ edit?: string; new?: string }> };

export default async function AdminThemesPage({ searchParams }: Props) {
  await requireAdmin();

  const db = getDb();
  const allThemes = await db.select().from(themes).orderBy(desc(themes.createdAt)).limit(100);
  const { edit: editId, new: isNew } = await searchParams;

  // --- Edit existing theme ---
  if (editId) {
    const theme = allThemes.find((t) => t.id === editId);
    if (!theme) redirect("/admin/themes");
    return (
      <div>
        <a href="/admin/themes" className="mb-4 inline-block text-sm text-text-muted hover:text-text-primary">
          ← Back to themes
        </a>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Edit: {theme.name}</h2>
        <ThemeEditor
          themeId={theme.id}
          initialName={theme.name}
          initialTokenSet={(theme.tokenSet as Record<string, unknown>) ?? {}}
          formAction={saveThemeAction}
        />
      </div>
    );
  }

  // --- Create new theme ---
  if (isNew) {
    return (
      <div>
        <a href="/admin/themes" className="mb-4 inline-block text-sm text-text-muted hover:text-text-primary">
          ← Back to themes
        </a>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">New theme</h2>
        <ThemeEditor
          themeId=""
          showKeyField
          initialName="New Theme"
          initialTokenSet={{}}
          formAction={saveThemeAction}
        />
      </div>
    );
  }

  // --- Theme list ---
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Themes</h1>
        <a
          href="/admin/themes?new=1"
          className="rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          New theme
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {allThemes.map((theme) => (
          <div key={theme.id} className="flex flex-col gap-3 rounded border border-border bg-white p-4">
            <ThemePreview tokens={(theme.tokenSet as Partial<ThemeTokens>) ?? {}} />

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-text-primary">{theme.name}</span>
                {theme.status === "active" && (
                  <span className="rounded-full bg-success-100 px-2 py-0.5 text-xs font-medium text-success-700">
                    Active
                  </span>
                )}
                {theme.origin === "system" && (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-text-muted">
                    System
                  </span>
                )}
              </div>
              <p className="mt-0.5 font-mono text-xs text-text-muted">{theme.key}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {theme.status !== "active" && (
                <form action={activateAction}>
                  <input type="hidden" name="id" value={theme.id} />
                  <button type="submit" className="rounded border border-primary-200 px-2 py-1 text-xs text-primary-700 hover:bg-primary-50">
                    Activate
                  </button>
                </form>
              )}
              {theme.origin !== "system" && (
                <>
                  <a
                    href={`/admin/themes?edit=${theme.id}`}
                    className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface"
                  >
                    Edit
                  </a>
                  {theme.status !== "active" && (
                    <form action={deleteAction}>
                      <input type="hidden" name="id" value={theme.id} />
                      <button type="submit" className="rounded border border-danger-200 px-2 py-1 text-xs text-danger-600 hover:bg-danger-50">
                        Delete
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
