'use client';

import { useHistory } from '@/lib/history';

export function BackLink({
  fallbackHref,
  children,
  className = 'text-sm text-primary hover:underline',
}: {
  fallbackHref: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { previousPath, goBack } = useHistory();
  const href = previousPath ?? fallbackHref;

  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        goBack(fallbackHref);
      }}
      className={className}
    >
      {children}
    </a>
  );
}
