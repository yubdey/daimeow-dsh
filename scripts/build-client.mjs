import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = resolve(root, 'src/client.template.js');
const outputPath = resolve(root, 'client.js');

const output = await readFile(templatePath, 'utf8');
if (output.includes('__DAIMEOW_CLIENT_DATA__') || output.includes('__DAIMEOW_RUNTIME_FUNCTION__')) {
  throw new Error('Desktop launcher must not embed model data or the Live2D runtime');
}

await writeFile(outputPath, output, 'utf8');
console.log(`Built ${outputPath} (${(Buffer.byteLength(output) / 1024).toFixed(2)} KiB)`);
