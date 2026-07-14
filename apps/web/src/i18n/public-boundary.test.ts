import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const publicLayout = readFileSync(new URL('../../app/(public)/layout.tsx', import.meta.url), 'utf8');
const readerPage = readFileSync(new URL('../../app/(public)/[...path]/page.tsx', import.meta.url), 'utf8');
const preferenceRoute = readFileSync(new URL('../../app/api/user/preferences/route.ts', import.meta.url), 'utf8');

describe('public localization cache boundary', () => {
  it('keeps public UI locale request-independent during document rendering', () => {
    expect(publicLayout).toContain('PublicI18nBoundary');
    expect(readerPage).toContain("dynamic = 'force-static'");
    expect(readerPage).toContain('getStaticLocale');
    expect(readerPage).not.toContain('getLocale()');
  });

  it('does not invoke public cache invalidation from preference writes', () => {
    expect(preferenceRoute).not.toContain('revalidatePath');
    expect(preferenceRoute).not.toContain('revalidateTag');
  });
});
