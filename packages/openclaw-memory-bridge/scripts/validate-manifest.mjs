import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const packageRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'openclaw.plugin.json'), 'utf8'));

function fail(message) {
  console.error(`Manifest validation failed: ${message}`);
  process.exitCode = 1;
}

for (const key of ['id', 'name', 'description', 'contracts', 'activation', 'configSchema']) {
  if (!(key in manifest)) fail(`openclaw.plugin.json is missing required key "${key}"`);
}

if (!Array.isArray(manifest.contracts?.tools)) {
  fail('openclaw.plugin.json contracts.tools must be an array');
} else {
  for (const tool of manifest.contracts.tools) {
    if (!manifest.toolMetadata?.[tool]) fail(`tool "${tool}" declared in contracts.tools has no toolMetadata entry`);
  }
}

const declaredCompat = pkg.openclaw?.compat?.pluginApi;
const peerRange = pkg.peerDependencies?.openclaw;
if (!declaredCompat || !peerRange) {
  fail('package.json must declare both openclaw.compat.pluginApi and peerDependencies.openclaw');
} else if (!peerRange.includes(declaredCompat.replace(/^>=/, ''))) {
  fail(`package.json openclaw.compat.pluginApi (${declaredCompat}) does not match peerDependencies.openclaw (${peerRange})`);
}

// A tag push of the form "openclaw-memory-bridge-vX.Y.Z" must publish exactly package.json's own version.
const tagRef = process.env.GITHUB_REF_NAME;
if (tagRef) {
  const match = tagRef.match(/^openclaw-memory-bridge-v(.+)$/);
  if (!match) {
    fail(`unexpected tag "${tagRef}"; expected "openclaw-memory-bridge-v<version>"`);
  } else if (match[1] !== pkg.version) {
    fail(`tag version "${match[1]}" does not match package.json version "${pkg.version}"`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log(`Manifest OK: ${manifest.id} v${pkg.version}`);
