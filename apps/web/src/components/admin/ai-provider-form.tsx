"use client";

import { useState, useTransition } from "react";

export type ProviderFormValues = {
  key: string;
  label: string;
  providerType: "openai" | "anthropic" | "ollama" | "custom";
  endpoint: string;
  apiKey: string;
  defaultModel: string;
  embeddingModel: string;
};

const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "ollama", label: "Ollama (self-hosted)" },
  { value: "custom", label: "Custom / OpenAI-compatible" },
];

interface AiProviderFormProps {
  formAction: (data: FormData) => Promise<void> | void;
  initialValues?: Partial<ProviderFormValues & { id: string }>;
}

export function AiProviderForm({ formAction, initialValues }: AiProviderFormProps) {
  const [providerType, setProviderType] = useState<string>(
    initialValues?.providerType ?? "openai",
  );
  const [pending, startTransition] = useTransition();

  const needsEndpoint = providerType === "ollama" || providerType === "custom";

  return (
    <form
      action={(fd) => startTransition(() => formAction(fd))}
      className="space-y-4"
    >
      {initialValues?.id && (
        <input type="hidden" name="id" value={initialValues.id} />
      )}

      <div className="grid grid-cols-2 gap-4">
        {!initialValues?.id && (
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Key (unique identifier)
            </label>
            <input
              name="key"
              defaultValue={initialValues?.key}
              required
              pattern="[a-z0-9_-]+"
              placeholder="my-openai"
              className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Label</label>
          <input
            name="label"
            defaultValue={initialValues?.label}
            required
            placeholder="My OpenAI Provider"
            className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          Provider Type
        </label>
        <select
          name="providerType"
          value={providerType}
          onChange={(e) => setProviderType(e.target.value)}
          className="w-full rounded border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
        >
          {PROVIDER_TYPES.map((pt) => (
            <option key={pt.value} value={pt.value}>
              {pt.label}
            </option>
          ))}
        </select>
      </div>

      {needsEndpoint && (
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">
            Endpoint URL
          </label>
          <input
            name="endpoint"
            defaultValue={initialValues?.endpoint}
            placeholder={
              providerType === "ollama"
                ? "http://localhost:11434"
                : "https://api.example.com"
            }
            className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          API Key {providerType === "ollama" ? "(optional)" : ""}
        </label>
        <input
          name="apiKey"
          type="password"
          defaultValue={initialValues?.apiKey}
          placeholder={initialValues?.id ? "Leave blank to keep existing" : "sk-..."}
          className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">
            Chat Model
          </label>
          <input
            name="defaultModel"
            defaultValue={initialValues?.defaultModel}
            placeholder={
              providerType === "openai"
                ? "gpt-4o-mini"
                : providerType === "anthropic"
                  ? "claude-haiku-4-5-20251001"
                  : "llama3"
            }
            className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">
            Embedding Model (optional)
          </label>
          <input
            name="embeddingModel"
            defaultValue={initialValues?.embeddingModel}
            placeholder={
              providerType === "openai" ? "text-embedding-3-small" : ""
            }
            className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : initialValues?.id ? "Save Changes" : "Add Provider"}
        </button>
        <a
          href="/admin/ai"
          className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:bg-neutral-50"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
