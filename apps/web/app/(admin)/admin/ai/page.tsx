import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/authorize";
import { getSession, buildPermissionContext } from "@/server/auth/session";
import { AiProviderForm } from "@/components/admin/ai-provider-form";

export const metadata = { title: "AI Providers — Admin" };
export const dynamic = "force-dynamic";

async function createProviderAction(formData: FormData) {
  "use server";
  const session = await getSession();
  const actor = await buildPermissionContext(session?.user.id ?? null);
  const { createProvider } = await import("@/server/services/ai/provider-service");

  const apiKey = formData.get("apiKey") as string;
  await createProvider(
    {
      key: formData.get("key") as string,
      label: formData.get("label") as string,
      providerType: formData.get("providerType") as string,
      endpoint: (formData.get("endpoint") as string) || undefined,
      credentials: apiKey ? { apiKey } : undefined,
      defaultModel: (formData.get("defaultModel") as string) || undefined,
      embeddingModel: (formData.get("embeddingModel") as string) || undefined,
    },
    actor,
  );
  redirect("/admin/ai");
}

async function updateProviderAction(formData: FormData) {
  "use server";
  const session = await getSession();
  const actor = await buildPermissionContext(session?.user.id ?? null);
  const { updateProvider } = await import("@/server/services/ai/provider-service");

  const id = formData.get("id") as string;
  const apiKey = formData.get("apiKey") as string;
  await updateProvider(
    id,
    {
      label: (formData.get("label") as string) || undefined,
      endpoint: (formData.get("endpoint") as string) || undefined,
      credentials: apiKey ? { apiKey } : undefined,
      defaultModel: (formData.get("defaultModel") as string) || undefined,
      embeddingModel: (formData.get("embeddingModel") as string) || undefined,
    },
    actor,
  );
  redirect("/admin/ai");
}

async function checkHealthAction(formData: FormData) {
  "use server";
  const session = await getSession();
  const actor = await buildPermissionContext(session?.user.id ?? null);
  const { checkProviderHealth } = await import("@/server/services/ai/provider-service");
  await checkProviderHealth(formData.get("id") as string, actor);
  revalidatePath("/admin/ai");
}

async function toggleStatusAction(formData: FormData) {
  "use server";
  const session = await getSession();
  const actor = await buildPermissionContext(session?.user.id ?? null);
  const { setProviderStatus, getProvider } = await import(
    "@/server/services/ai/provider-service"
  );
  const id = formData.get("id") as string;
  const provider = await getProvider(id, actor);
  await setProviderStatus(id, provider.status === "enabled" ? "disabled" : "enabled", actor);
  revalidatePath("/admin/ai");
}

async function deleteProviderAction(formData: FormData) {
  "use server";
  const session = await getSession();
  const actor = await buildPermissionContext(session?.user.id ?? null);
  const { deleteProvider } = await import("@/server/services/ai/provider-service");
  await deleteProvider(formData.get("id") as string, actor);
  revalidatePath("/admin/ai");
}

const STATUS_COLORS: Record<string, string> = {
  enabled: "text-success-700 bg-success-50 border-success-200",
  disabled: "text-text-muted bg-neutral-50 border-neutral-200",
  error: "text-danger-700 bg-danger-50 border-danger-200",
};

export default async function AiProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string }>;
}) {
  await requireAdmin();
  const session = await getSession();
  const actor = await buildPermissionContext(session?.user.id ?? null);
  const { listProviders, getProvider } = await import(
    "@/server/services/ai/provider-service"
  );
  const params = await searchParams;

  const providers = await listProviders(actor);

  const editId = params.edit;
  const editProvider = editId ? await getProvider(editId, actor).catch(() => null) : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">AI Providers</h1>
        <a
          href="/admin/ai?new=1"
          className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Add Provider
        </a>
      </div>

      {params.new && (
        <div className="mb-8 rounded border border-border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-text-primary">New AI Provider</h2>
          <AiProviderForm formAction={createProviderAction} />
        </div>
      )}

      {editProvider && (
        <div className="mb-8 rounded border border-border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-text-primary">
            Edit: {editProvider.label}
          </h2>
          <AiProviderForm
            formAction={updateProviderAction}
            initialValues={{
              id: editProvider.id,
              label: editProvider.label,
              providerType: editProvider.providerType as "openai" | "anthropic" | "ollama" | "custom",
              endpoint: editProvider.endpoint ?? "",
              defaultModel: editProvider.defaultModel ?? "",
              embeddingModel: editProvider.embeddingModel ?? "",
            }}
          />
        </div>
      )}

      {providers.length === 0 && !params.new ? (
        <div className="rounded border border-border bg-white p-8 text-center text-text-muted">
          No AI providers configured. Add one to enable AI chat.
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded border border-border bg-white px-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{p.label}</span>
                  <span className="font-mono text-xs text-text-muted">{p.key}</span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] ?? STATUS_COLORS.disabled}`}
                  >
                    {p.status}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-text-muted">
                  {p.providerType}
                  {p.defaultModel ? ` · ${p.defaultModel}` : ""}
                  {p.endpoint ? ` · ${p.endpoint}` : ""}
                </div>
                {p.errorMessage && (
                  <div className="mt-1 text-xs text-danger-600">{p.errorMessage}</div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <form action={checkHealthAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:bg-neutral-50"
                  >
                    Check Health
                  </button>
                </form>

                <form action={toggleStatusAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:bg-neutral-50"
                  >
                    {p.status === "enabled" ? "Disable" : "Enable"}
                  </button>
                </form>

                <a
                  href={`/admin/ai?edit=${p.id}`}
                  className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:bg-neutral-50"
                >
                  Edit
                </a>

                <form action={deleteProviderAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    className="rounded border border-danger-200 px-2 py-1 text-xs text-danger-600 hover:bg-danger-50"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <a
          href="/admin/ai/conversations"
          className="text-sm text-link hover:underline"
        >
          View all conversations →
        </a>
      </div>
    </div>
  );
}
