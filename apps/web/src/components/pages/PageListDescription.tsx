/** Renders an authored summary/excerpt as text only; React escaping prevents
 * page metadata from becoming markup in navigation and listing views. */
export function PageListDescription({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return <p className="mt-xs text-sm text-muted">{value}</p>;
}
