import { writeFile } from 'node:fs/promises';

export default async function teardown() {
  await writeFile(
    new URL('../next-env.d.ts', import.meta.url),
    `/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/dev/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
`,
  );
}
