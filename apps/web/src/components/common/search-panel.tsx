"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function SearchPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        className="flex-1 rounded border border-border px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
        aria-label="Search pages"
      />
      <button
        type="submit"
        disabled={!query.trim()}
        className="rounded bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
      >
        Search
      </button>
    </form>
  );
}
