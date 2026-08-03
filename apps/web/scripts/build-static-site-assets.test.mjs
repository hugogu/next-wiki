import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Build-time assets for the static site: compiled stylesheet, bundled client
 * runtime, and self-hosted KaTeX resources. The output lives in
 * `public/static-site/` and is referenced by the publish job via `manifest.json`.
 *
 * The test runs the same script CI/build uses, then inspects the produced files.
 */

const __filename = fileURLToPath(import.meta.url);
const scriptDir = dirname(__filename);
const appRoot = resolve(scriptDir, '..');
const scriptPath = join(scriptDir, 'build-static-site-assets.mjs');
const outDir = join(appRoot, 'public', 'static-site');

function isAbsoluteExternalUrl(value) {
  // Only flag real URL references: http(s):// or protocol-relative // inside a
  // url(), @import, or bare string. CSS custom properties like --x:0 must not
  // be treated as external URLs.
  return /\b(?:https?:|\/\/)/i.test(value);
}

async function readManifest() {
  const raw = await readFile(join(outDir, 'manifest.json'), 'utf8');
  return JSON.parse(raw);
}

async function fileExists(relativePath) {
  try {
    await stat(join(outDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function resetOutDir() {
  // The script already resets the directory on start, but a leftover from a
  // killed run could confuse assertions.
  try {
    await stat(outDir);
    await execFileSync('rm', ['-rf', outDir]);
  } catch {
    // directory does not exist
  }
}

beforeEach(async () => {
  await resetOutDir();
});

afterEach(async () => {
  // Leave the build output in place so the Next.js app and other tests can
  // reference it; do not clean up.
});

describe('build-static-site-assets', () => {
  it('builds stylesheet, runtime, and katex resources and writes a manifest', { timeout: 300_000 }, async () => {
    execFileSync('node', [scriptPath], { cwd: appRoot, stdio: 'pipe' });

    const manifest = await readManifest();
    expect(manifest).toHaveProperty('stylesheet');
    expect(manifest).toHaveProperty('script');
    expect(manifest).toHaveProperty('katexStylesheet');

    expect(await fileExists(manifest.stylesheet)).toBe(true);
    expect(await fileExists(manifest.script)).toBe(true);
    expect(await fileExists(manifest.katexStylesheet)).toBe(true);
  });

  it('content-hashes the stylesheet, runtime, and katex stylesheet', { timeout: 300_000 }, async () => {
    execFileSync('node', [scriptPath], { cwd: appRoot, stdio: 'pipe' });

    const manifest = await readManifest();
    // The stylesheet is hashed with sha256 hex; esbuild hashes the runtime in
    // its own base64-like alphabet. Both are content hashes, just different
    // encodings, so the pattern accepts both.
    const hashPattern = /\.[a-zA-Z0-9_-]{8}\./;
    expect(manifest.stylesheet).toMatch(hashPattern);
    expect(manifest.script).toMatch(hashPattern);
    expect(manifest.katexStylesheet).toMatch(hashPattern);

    // Verify the stylesheet hash is literally sha256(content)[:8].
    const css = await readFile(join(outDir, manifest.stylesheet));
    const expectedHash = createHash('sha256').update(css).digest('hex').slice(0, 8);
    expect(manifest.stylesheet).toContain(`.${expectedHash}.`);
  });

  it('does not reference absolute external URLs in the stylesheet', { timeout: 300_000 }, async () => {
    execFileSync('node', [scriptPath], { cwd: appRoot, stdio: 'pipe' });

    const manifest = await readManifest();
    const css = await readFile(join(outDir, manifest.stylesheet), 'utf8');

    for (const line of css.match(/url\([^)]*\)|@import[^;]*/gi) ?? []) {
      expect(
        isAbsoluteExternalUrl(line),
        `stylesheet references an absolute external URL: ${line.trim().slice(0, 120)}`,
      ).toBe(false);
    }
  });

  it('copies the KaTeX fonts needed for self-contained math rendering', { timeout: 300_000 }, async () => {
    execFileSync('node', [scriptPath], { cwd: appRoot, stdio: 'pipe' });

    const files = await readdir(outDir, { withFileTypes: true });
    const fontDir = files.find((entry) => entry.isDirectory() && entry.name === 'fonts');
    expect(fontDir).toBeDefined();

    const fonts = await readdir(join(outDir, 'fonts'));
    const woff2Fonts = fonts.filter((name) => name.endsWith('.woff2'));
    expect(woff2Fonts.length).toBeGreaterThan(0);
  });
});
