'use client';

import { useCallback } from 'react';
import { useHistory } from '@/lib/history';
import { getSpaceEditHref, getSpaceHref, type ReaderSpace } from '@/lib/path';
import { NewPageDialog } from './NewPageDialog';

export function CreatePageForm({
  initialPathPrefix,
  space = 'wiki',
}: {
  initialPathPrefix?: string;
  space?: ReaderSpace;
}) {
  const { goBack } = useHistory();

  const handleClose = useCallback(() => {
    goBack(getSpaceHref(space));
  }, [goBack, space]);

  const handleCreated = useCallback((path: string) => {
    window.location.href = space === 'raw' ? getSpaceHref(space, path) : getSpaceEditHref(space, path);
  }, [space]);

  return <NewPageDialog onClose={handleClose} onCreated={handleCreated} initialPathPrefix={initialPathPrefix} space={space} />;
}
