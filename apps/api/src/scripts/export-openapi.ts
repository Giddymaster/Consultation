import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildApp } from '../app.js';

/**
 * Writes the OpenAPI document to disk.
 *
 * Generated from the live route definitions rather than maintained by hand, so
 * the specification cannot drift from what the server actually serves.
 */
async function main(): Promise<void> {
  const app = await buildApp();
  await app.ready();

  const document = app.swagger();
  const target = resolve(process.argv[2] ?? 'openapi.json');

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(document, null, 2), 'utf8');

  const paths = Object.keys((document as { paths?: Record<string, unknown> }).paths ?? {});
  process.stdout.write(`OpenAPI written to ${target} (${paths.length} paths)\n`);

  await app.close();
  process.exit(0);
}

void main();
