import type { PublicPageAddressList, PublicPageAddress } from '@next-wiki/shared';
import { apiDelete, apiGet, apiPost } from './client';
import { getPublicApiPageAddressUrl, getPublicApiPageAddressesUrl } from '@/lib/path';

export async function listAddresses(pageId: string): Promise<PublicPageAddressList> {
  return apiGet<PublicPageAddressList>(getPublicApiPageAddressesUrl(pageId));
}

export async function addAddressAlias(pageId: string, address: string): Promise<PublicPageAddress> {
  return apiPost<{ address: string }, PublicPageAddress>(getPublicApiPageAddressesUrl(pageId), { address });
}

/**
 * `kind: 'retained'` removal requires `confirmBreakingPublicLinks: true` —
 * omitting it (or passing false) on a retained alias returns
 * `409 ADDRESS_ALIAS_RETAINED`, stating the consequence, rather than
 * removing it (FR-022).
 */
export async function removeAddressAlias(
  pageId: string,
  addressId: string,
  options: { confirmBreakingPublicLinks?: boolean } = {},
): Promise<{ address: string; kind: 'retained' | 'manual' }> {
  const query = options.confirmBreakingPublicLinks ? '?confirmBreakingPublicLinks=true' : '';
  return apiDelete<{ address: string; kind: 'retained' | 'manual' }>(`${getPublicApiPageAddressUrl(pageId, addressId)}${query}`);
}
