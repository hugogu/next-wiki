type Props = {
  requestedLocale: string;
  fallbackLocale: string;
};

// Rendered server-side when the requested locale has no translation.
// FR-019: system must fall back and clearly indicate unavailability.
export function MissingTranslationBanner({ requestedLocale, fallbackLocale }: Props) {
  return (
    <div
      role="alert"
      className="mb-4 rounded border border-warning-300 bg-warning-50 px-4 py-3 text-sm text-warning-700"
    >
      <strong>Translation unavailable</strong> — the{" "}
      <code className="font-mono">{requestedLocale}</code> version of this page has not been
      created yet. Showing the{" "}
      <code className="font-mono">{fallbackLocale}</code> version instead.
    </div>
  );
}
