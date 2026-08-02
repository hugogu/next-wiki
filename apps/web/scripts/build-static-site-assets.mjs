import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

/**
 * Build the static site's stylesheet and client runtime.
 *
 * These do not vary with wiki content, so they are produced once per image and
 * copied verbatim into every snapshot. Building them per publish would put a
 * CSS/JS toolchain on the runtime path for no benefit.
 *
 * Output goes to `public/static-site/`, which the publish job copies into the
 * artifact's reserved `_static/` prefix.
 */

const require = createRequire(import.meta.url);
const appRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
const outDir = path.join(appRoot, 'public', 'static-site');

function log(message) {
  process.stdout.write(`[static-site-assets] ${message}\n`);
}

function hashOf(contents) {
  return createHash('sha256').update(contents).digest('hex').slice(0, 8);
}

function reset() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
}

/**
 * Compile globals.css with Tailwind, scanning the static site's own sources.
 *
 * The content globs deliberately exclude the app's routes: the published site
 * uses a subset of the design system, and scanning everything would ship
 * utilities no published page can reference.
 */
function buildStylesheet() {
  const configPath = path.join(outDir, '.tailwind.config.cjs');
  const content = [
    path.join(appRoot, 'src/server/static-site/**/*.{ts,tsx}'),
    path.join(appRoot, 'src/static-site/**/*.{ts,tsx}'),
    // The renderer components are mounted into the published document, so the
    // classes they use must survive purging.
    path.join(appRoot, 'src/components/renderer/**/*.{ts,tsx}'),
    path.join(appRoot, 'src/components/ui/**/*.{ts,tsx}'),
    path.join(appRoot, 'src/components/theme/**/*.{ts,tsx}'),
  ];

  const appConfig = fs.readFileSync(path.join(appRoot, 'tailwind.config.ts'), 'utf8');
  // Reuse the app's theme extension verbatim so tokens cannot drift; only the
  // content globs differ.
  const themeBlock = appConfig.slice(appConfig.indexOf('theme:'), appConfig.lastIndexOf('plugins:'));
  fs.writeFileSync(
    configPath,
    `module.exports = {\n  content: ${JSON.stringify(content)},\n  ${themeBlock}  plugins: [],\n};\n`,
  );

  const cssIn = path.join(appRoot, 'app', 'globals.css');
  const cssOut = path.join(outDir, 'site.tmp.css');
  // `pnpm exec` rather than `npx`: pnpm's node_modules is a symlink tree that
  // npx does not always resolve, and npx would try the network on a miss —
  // neither is acceptable inside an image build.
  execFileSync(
    'pnpm',
    ['exec', 'tailwindcss', '-c', configPath, '-i', cssIn, '-o', cssOut, '--minify'],
    { cwd: appRoot, stdio: 'inherit' },
  );

  const css = fs.readFileSync(cssOut);
  fs.rmSync(cssOut);
  fs.rmSync(configPath);
  const name = `site.${hashOf(css)}.css`;
  fs.writeFileSync(path.join(outDir, name), css);
  log(`stylesheet ${name} (${(css.length / 1024).toFixed(1)} kB)`);
  return name;
}

async function buildRuntime() {
  const result = await esbuild.build({
    entryPoints: [path.join(appRoot, 'src/static-site/client/index.tsx')],
    bundle: true,
    format: 'esm',
    // The published site is read in current browsers; no legacy target needed.
    target: ['es2022'],
    minify: true,
    splitting: true,
    outdir: outDir,
    entryNames: 'site.[hash]',
    chunkNames: 'chunk.[hash]',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.json': 'json' },
    // Mirrors the app's `@/*` path alias.
    alias: { '@': path.join(appRoot, 'src') },
    metafile: true,
    logLevel: 'warning',
  });

  const entry = Object.entries(result.metafile.outputs).find(
    ([, output]) => output.entryPoint?.endsWith('src/static-site/client/index.tsx'),
  );
  if (!entry) throw new Error('esbuild produced no entry point for the static site runtime');
  const name = path.basename(entry[0]);
  const bytes = fs.statSync(path.join(outDir, name)).size;
  log(`runtime ${name} (${(bytes / 1024).toFixed(1)} kB)`);
  return name;
}

/**
 * Copy KaTeX's stylesheet and fonts.
 *
 * The published site may not fetch these from a CDN (FR-020), so they travel
 * inside the artifact. KaTeX references its fonts relatively, which is why the
 * directory layout is preserved.
 */
function copyKatex() {
  const katexDist = path.dirname(require.resolve('katex/package.json'));
  const cssSource = path.join(katexDist, 'dist', 'katex.min.css');
  const css = fs.readFileSync(cssSource);
  const name = `katex.${hashOf(css)}.css`;
  fs.writeFileSync(path.join(outDir, name), css);

  const fontsOut = path.join(outDir, 'fonts');
  fs.mkdirSync(fontsOut, { recursive: true });
  const fontsIn = path.join(katexDist, 'dist', 'fonts');
  let fontCount = 0;
  for (const file of fs.readdirSync(fontsIn)) {
    // woff2 alone covers every browser that can run this site; shipping the
    // legacy formats would triple the font payload for no reader.
    if (!file.endsWith('.woff2')) continue;
    fs.copyFileSync(path.join(fontsIn, file), path.join(fontsOut, file));
    fontCount += 1;
  }
  log(`katex ${name} + ${fontCount} fonts`);
  return name;
}

async function main() {
  reset();
  const stylesheet = buildStylesheet();
  const katexStylesheet = copyKatex();
  const script = await buildRuntime();

  // The publish job reads this to reference the hashed filenames.
  const manifest = { stylesheet, script, katexStylesheet };
  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  log('done');
}

await main();
