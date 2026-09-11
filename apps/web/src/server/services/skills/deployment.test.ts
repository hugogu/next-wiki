import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILTIN_SKILL_PACKAGES } from './builtin';

/**
 * The built-in packages are plain files read by path at runtime, so Next's
 * dependency tracing never sees them and the standalone bundle omits them.
 * They reach the image only because the Dockerfile copies them explicitly.
 *
 * That copy was missing once, and the failure was invisible: `resolveRoot()`
 * finds nothing, `loadBuiltinSkills()` returns an empty list, and the product
 * ships with no skills at all while every local dev server looks fine. This
 * test ties the runtime requirement to the build config so the next person to
 * touch either one finds out here instead of in production.
 */
describe('built-in skill deployment', () => {
  const repoRoot = path.resolve(__dirname, '../../../../../..');
  const dockerfile = fs.readFileSync(path.join(repoRoot, 'docker/Dockerfile'), 'utf8');

  it('copies the shipped skill packages into the runtime image', () => {
    const copies = dockerfile
      .split('\n')
      .filter((line) => line.startsWith('COPY') && line.includes('src/server/skills'));
    expect(copies).toHaveLength(1);
    // The destination must land where the server's working directory expects
    // it: start.mjs runs the server with cwd /app/apps/web, and the loader
    // resolves 'src/server/skills/builtin' relative to that.
    expect(copies[0]).toContain('./apps/web/src/server/skills');
  });

  it('ships a package directory for every registered built-in', () => {
    for (const name of BUILTIN_SKILL_PACKAGES) {
      const instruction = path.join(repoRoot, 'apps/web/src/server/skills/builtin', name, 'SKILL.md');
      expect(fs.existsSync(instruction), `${name}/SKILL.md is missing`).toBe(true);
    }
  });
});
