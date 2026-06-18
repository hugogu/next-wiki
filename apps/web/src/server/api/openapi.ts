import fs from 'node:fs/promises';
import path from 'node:path';
import { generateProject } from 'next-openapi-gen';

/**
 * Programmatic OpenAPI generation entry point.
 *
 * Runs the same generation pipeline as `pnpm exec openapi-gen generate`,
 * loading `openapi-gen.config.ts` from the web package root. The resulting
 * spec is written to `public/openapi.json` and served by `/api/openapi.json`.
 */
export async function generateOpenApiSpec() {
  const cwd = path.resolve(process.cwd());
  await generateProject({ cwd });
  const outputPath = path.join(cwd, 'public', 'openapi.json');
  const spec = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  return { outputPath, spec };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateOpenApiSpec().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
