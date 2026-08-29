// Loads the built, packed-and-reinstalled entry point exactly as a Gateway
// would, to catch a broken `exports` field or a peer-dependency import that
// only fails once the package leaves the monorepo's own node_modules.
const { default: plugin } = await import('@next-wiki/openclaw-memory-bridge');

if (plugin.id !== 'next-wiki-memory-bridge') {
  throw new Error(`unexpected plugin id: ${plugin.id}`);
}
if (typeof plugin.register !== 'function') {
  throw new Error('plugin.register is not a function');
}

console.log(`Runtime inspection OK: ${plugin.id}`);
