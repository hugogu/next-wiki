import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const enPath = path.join(root, 'messages', 'en.json');
const outPath = path.join(root, 'src', 'i18n', 'keys.ts');

const catalog = JSON.parse(fs.readFileSync(enPath, 'utf8'));

function flatten(value, prefix = '', output = []) {
  if (typeof value === 'string') {
    output.push(prefix);
    return output;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Message ${prefix || '<root>'} must be a string or object`);
  }
  if (Object.prototype.hasOwnProperty.call(value, '__value')) {
    output.push(prefix);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === '__value') continue;
    flatten(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

const keys = flatten(catalog);
const body = keys.map((key) => `  ${JSON.stringify(key)},`).join('\n');
const contents = `/** Generated from messages/en.json; run generate-i18n-keys to refresh, validate-i18n to verify parity. */
export const translationKeys = [
${body}
] as const;

export type TranslationKey = (typeof translationKeys)[number];
`;

fs.writeFileSync(outPath, contents);
console.log(`Wrote ${keys.length} translation keys to ${path.relative(root, outPath)}`);
