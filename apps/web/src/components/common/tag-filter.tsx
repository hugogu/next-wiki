"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Tag = { slug: string; label: string; colorToken?: string | null };

type Props = {
  tags: Tag[];
  selectedSlugs?: string[];
};

export function TagFilter({ tags, selectedSlugs = [] }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function toggle(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.getAll("tag");
    if (current.includes(slug)) {
      params.delete("tag");
      current.filter((t) => t !== slug).forEach((t) => params.append("tag", t));
    } else {
      params.append("tag", slug);
    }
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  }

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const isActive = selectedSlugs.includes(tag.slug);
        return (
          <button
            key={tag.slug}
            onClick={() => toggle(tag.slug)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              isActive
                ? "bg-primary-600 text-white"
                : "bg-surface text-text-secondary hover:bg-primary-50"
            }`}
          >
            #{tag.label}
          </button>
        );
      })}
    </div>
  );
}
