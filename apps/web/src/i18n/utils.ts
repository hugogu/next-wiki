export function interpolate(
  template: string,
  params?: Record<string, string | number | undefined>,
): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = params[key];
    return value === undefined ? `{{${key}}}` : String(value);
  });
}
