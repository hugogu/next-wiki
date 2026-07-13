import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const messagesDir = path.join(root, 'messages');
const catalogs = {
  en: JSON.parse(fs.readFileSync(path.join(messagesDir, 'en.json'), 'utf8')),
  zh: JSON.parse(fs.readFileSync(path.join(messagesDir, 'zh.json'), 'utf8')),
};

function flatten(value, prefix = '', output = new Map()) {
  if (typeof value === 'string') {
    output.set(prefix, value);
    return output;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Message ${prefix || '<root>'} must be a string or object`);
  }

  if (Object.prototype.hasOwnProperty.call(value, '__value')) {
    if (typeof value.__value !== 'string') throw new Error(`Message ${prefix}.__value must be a string`);
    output.set(prefix, value.__value);
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === '__value') continue;
    flatten(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

function variables(message) {
  return new Set([...message.matchAll(/\{([A-Za-z][\w-]*)\b/g)].map((match) => match[1]));
}

const flattened = Object.fromEntries(Object.entries(catalogs).map(([locale, catalog]) => [locale, flatten(catalog)]));
const baselineKeys = [...flattened.en.keys()].sort();
const errors = [];

for (const [locale, messages] of Object.entries(flattened)) {
  const keys = [...messages.keys()].sort();
  if (keys.join('\n') !== baselineKeys.join('\n')) {
    const missing = baselineKeys.filter((key) => !messages.has(key));
    const extra = keys.filter((key) => !flattened.en.has(key));
    if (missing.length) errors.push(`${locale}: missing ${missing.join(', ')}`);
    if (extra.length) errors.push(`${locale}: extra ${extra.join(', ')}`);
  }
}

for (const key of baselineKeys) {
  const expected = [...variables(flattened.en.get(key))].sort();
  const actual = [...variables(flattened.zh.get(key))].sort();
  if (expected.join(',') !== actual.join(',')) {
    errors.push(`${key}: ICU variables differ (en: ${expected.join(',')}; zh: ${actual.join(',')})`);
  }
}

if (errors.length) {
  console.error(`i18n validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`i18n catalogs valid: ${baselineKeys.length} keys across ${Object.keys(catalogs).length} locales`);
}
