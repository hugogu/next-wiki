function normalizeDomain(value: string): string | null {
  const candidate = value.trim().toLowerCase().replace(/^\.+/, '');
  if (!candidate || candidate.includes('/') || candidate.includes(':')) return null;
  return candidate;
}

export function normalizeDomains(values: string[]): string[] {
  return [...new Set(values.map(normalizeDomain).filter((value): value is string => Boolean(value)))];
}

/** Configuration is rejected instead of silently dropping an invalid domain so
 * an administrator never believes a source policy is active when it is not. */
export function validateDomains(values: string[]): string[] {
  const invalid = values.find((value) => {
    const domain = normalizeDomain(value);
    return !domain || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(domain);
  });
  if (invalid !== undefined) throw new Error(`Invalid domain: ${invalid}`);
  return normalizeDomains(values);
}

export function isAllowedWebUrl(urlValue: string, allowedDomains: string[], blockedDomains: string[]): boolean {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (blockedDomains.some(matches)) return false;
  return allowedDomains.length === 0 || allowedDomains.some(matches);
}
