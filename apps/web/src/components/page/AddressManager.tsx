'use client';

import { useEffect, useState } from 'react';
import type { PublicPageAddress, PublicPageAddressList } from '@next-wiki/shared';
import { pageAddressSchema } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { PlusIcon, XIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { addAddressAlias, listAddresses, removeAddressAlias } from '@/lib/api/addresses';
import type { ApiError } from '@/lib/api/client';

/**
 * A page's canonical address plus every retained/manually added alias
 * (FR-020, US4). Read-only list always shows; adding and removing a
 * *manual* alias needs only page-edit permission (already implied by this
 * dialog being reachable). Removing a *retained* alias additionally
 * requires space-manage permission — enforced server-side, surfaced here as
 * a `FORBIDDEN` error rather than a client-side capability check, since a
 * plain editor can still legitimately open this panel.
 */
export function AddressManager({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const [list, setList] = useState<PublicPageAddressList | null>(null);
  const [newAddress, setNewAddress] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PublicPageAddress | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listAddresses(pageId)
      .then((result) => {
        if (!cancelled) setList(result);
      })
      .catch(() => {
        if (!cancelled) setList({ canonical: { address: '', url: '' }, aliases: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  function describeError(error: ApiError, fallback: string): string {
    switch (error.code) {
      case 'PAGE_SLUG_TAKEN':
      case 'PAGE_ADDRESS_TAKEN':
        return t('page.addresses.error.taken');
      case 'PAGE_SLUG_RESERVED':
        return t('page.addresses.error.reserved');
      case 'PAGE_SLUG_INVALID':
        return t('page.addresses.error.invalid');
      case 'PAGE_ADDRESS_SELF':
        return t('page.addresses.error.self');
      case 'FORBIDDEN':
      case 'UNAUTHORIZED':
        return t('page.addresses.error.forbidden');
      default:
        return error.message || fallback;
    }
  }

  async function handleAdd() {
    setAddError(null);
    const parsed = pageAddressSchema.safeParse(newAddress);
    if (!parsed.success) {
      setAddError(parsed.error.issues[0]?.message ?? t('page.addresses.error.invalid'));
      return;
    }
    setAdding(true);
    try {
      const created = await addAddressAlias(pageId, parsed.data);
      setList((current) => (current ? { ...current, aliases: [...current.aliases, created] } : current));
      setNewAddress('');
    } catch (cause) {
      setAddError(describeError(cause as ApiError, t('page.addresses.error.generic')));
    } finally {
      setAdding(false);
    }
  }

  function requestRemove(alias: PublicPageAddress) {
    setRemoveError(null);
    if (alias.kind === 'manual') {
      void performRemove(alias, {});
    } else {
      setPendingRemoval(alias);
    }
  }

  async function performRemove(alias: PublicPageAddress, options: { confirmBreakingPublicLinks?: boolean }) {
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeAddressAlias(pageId, alias.id, options);
      setList((current) => (current ? { ...current, aliases: current.aliases.filter((a) => a.id !== alias.id) } : current));
      setPendingRemoval(null);
    } catch (cause) {
      setRemoveError(describeError(cause as ApiError, t('page.addresses.error.generic')));
    } finally {
      setRemoving(false);
    }
  }

  if (list === null) return null;

  return (
    <section aria-label={t('page.addresses.heading')} className="space-y-xs">
      <h2 className="text-sm font-medium text-muted">{t('page.addresses.heading')}</h2>

      <ul className="flex flex-col gap-xs">
        <li className="flex items-center gap-sm rounded-md border border-border px-sm py-xs text-sm">
          <span className="shrink-0 rounded-full bg-primary/10 px-sm py-0.5 text-xs font-medium text-primary">
            {t('page.addresses.kindCanonical')}
          </span>
          <span className="min-w-0 flex-1 truncate">{list.canonical.address}</span>
        </li>
        {list.aliases.map((alias) => (
          <li key={alias.id} className="flex items-center gap-sm rounded-md border border-border px-sm py-xs text-sm">
            <span className="shrink-0 rounded-full bg-surface-elevated px-sm py-0.5 text-xs font-medium text-muted">
              {alias.kind === 'retained' ? t('page.addresses.kindRetained') : t('page.addresses.kindManual')}
            </span>
            <span className="min-w-0 flex-1 truncate">{alias.address}</span>
            <button
              type="button"
              onClick={() => requestRemove(alias)}
              aria-label={t('page.addresses.remove', { address: alias.address })}
              className="shrink-0 inline-flex items-center rounded-full text-muted hover:text-danger"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-sm">
        <Input
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
          placeholder={t('page.addresses.addPlaceholder')}
          aria-label={t('page.addresses.addLabel')}
        />
        <Button type="button" variant="secondary" disabled={adding || !newAddress} onClick={() => void handleAdd()}>
          <PlusIcon className="h-3.5 w-3.5" />
          {adding ? t('page.addresses.adding') : t('page.addresses.add')}
        </Button>
      </div>
      {addError && <p className="text-xs text-danger" role="alert">{addError}</p>}

      {pendingRemoval && (
        <ConfirmDialog
          title={t('page.addresses.removeRetainedConfirmTitle')}
          message={t('page.addresses.removeRetainedConfirmMessage', { address: pendingRemoval.address })}
          confirmLabel={t('page.addresses.removeConfirm')}
          confirmVariant="danger"
          pending={removing}
          error={removeError ?? undefined}
          onConfirm={() => void performRemove(pendingRemoval, { confirmBreakingPublicLinks: true })}
          onCancel={() => {
            if (!removing) {
              setPendingRemoval(null);
              setRemoveError(null);
            }
          }}
        />
      )}
    </section>
  );
}
