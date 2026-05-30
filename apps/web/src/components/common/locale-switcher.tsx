"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  spaceKey: string;
  pagePath: string;
  currentLocale: string;
  availableLocales: string[];
};

export function LocaleSwitcher({ spaceKey, pagePath, currentLocale, availableLocales }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(locale: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("locale", locale);
    router.push(`/${spaceKey}${pagePath}?${params.toString()}`);
  }

  if (availableLocales.length <= 1) return null;

  return (
    <select
      value={currentLocale}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded border border-border bg-surface px-2 py-1 text-sm text-text-secondary"
      aria-label="Switch language"
    >
      {availableLocales.map((locale) => (
        <option key={locale} value={locale}>
          {locale.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
