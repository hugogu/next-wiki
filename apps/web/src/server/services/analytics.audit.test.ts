import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'node:fs';

/**
 * Enforces FR-013 ("no per-page analytics code"): the vendor loader hosts
 * must appear only in the analytics service, never hand-rolled into a page,
 * layout, or component. `app/layout.tsx` injects the service's pre-built
 * script string but never mentions the vendor hosts by name.
 */

const ROOT = path.resolve(__dirname, '../../../../..');
const SERVICE_FILE = 'apps/web/src/server/services/analytics.ts';
const NEEDLES = ['hm.baidu.com', 'googletagmanager.com'];

function findMatches(): { file: string; needle: string }[] {
  const files = [
    ...globSync('apps/web/app/**/*.{ts,tsx}', { cwd: ROOT }),
    ...globSync('apps/web/src/**/*.{ts,tsx}', { cwd: ROOT }),
  ].filter((file) => !/\.(test|spec)\.tsx?$/.test(file));
  const matches: { file: string; needle: string }[] = [];
  for (const file of files) {
    const content = readFileSync(path.join(ROOT, file), 'utf8');
    for (const needle of NEEDLES) {
      if (content.includes(needle)) matches.push({ file, needle });
    }
  }
  return matches;
}

describe('analytics vendor host audit', () => {
  it('only references vendor analytics hosts inside the analytics service', () => {
    const matches = findMatches();
    const offenders = matches.filter((m) => m.file !== SERVICE_FILE);
    expect(offenders).toEqual([]);
    expect(matches.some((m) => m.file === SERVICE_FILE)).toBe(true);
  });
});
