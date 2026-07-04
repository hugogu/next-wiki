'use client';

import { useCallback } from 'react';
import { useHistory } from '@/lib/history';
import { getEditHref } from '@/lib/path';
import { NewPageDialog } from './NewPageDialog';

export function CreatePageForm() {
  const { goBack } = useHistory();

  const handleClose = useCallback(() => {
    goBack('/');
  }, [goBack]);

  const handleCreated = useCallback((path: string) => {
    window.location.href = getEditHref(path);
  }, []);

  return <NewPageDialog onClose={handleClose} onCreated={handleCreated} />;
}
