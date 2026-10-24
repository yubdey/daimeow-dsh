import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = resolve(root, 'src/client.template.js');
const outputPath = resolve(root, 'client.js');
const corePath = resolve(root, 'runtime/live2dcubismcore.js');
const bundlePath = resolve(root, 'runtime/pet-bundle.js');
const modelRoot = resolve(root, 'assets/model/daimeow');
const propRoot = resolve(root, 'assets/props');

function mimeFor(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

async function readBase64(path) {
  const data = await readFile(path);
  return `data:${mimeFor(path)};base64,${data.toString('base64')}`;
}

async function collectFiles(directory) {
  const { readdir } = await import('node:fs/promises');
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) results.push(...await collectFiles(path));
    else results.push(path);
  }
  return results;
}

const modelDocument = JSON.parse(await readFile(
  resolve(modelRoot, 'daimeow.model3.json'),
  'utf8',
));
const assets = {};
for (const path of await collectFiles(modelRoot)) {
  assets[`model/daimeow/${relative(modelRoot, path).replaceAll('\\', '/')}`] = await readBase64(path);
}
for (const path of await collectFiles(propRoot)) {
  assets[`assets/${relative(propRoot, path).replaceAll('\\', '/')}`] = await readBase64(path);
}

let runtime = [
  await readFile(corePath, 'utf8'),
  'window.Live2DCubismCore = Live2DCubismCore;',
  await readFile(bundlePath, 'utf8'),
  '',
].join('\n');
const replacements = [
  [
    /width: window\.innerWidth,\s*height: window\.innerHeight/,
    'width: canvas.clientWidth || window.innerWidth,\n    height: canvas.clientHeight || window.innerHeight',
  ],
  [
    'app.renderer.resize(window.innerWidth, window.innerHeight)',
    'app.renderer.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight)',
  ],
  [
    'var app = new Application({',
    'var app = window.__daimeowApp = new Application({',
  ],
  [
    'var actionController = createActionController({',
    'var actionController = window.__daimeowActionController = createActionController({',
  ],
  [
    'document.addEventListener("pointerdown", (e2)',
    '(window.__DAIMEOW_UI_ROOT__ || document).addEventListener("pointerdown", (e2)',
  ],
  [
    'document.addEventListener("pointermove", (e2)',
    '(window.__DAIMEOW_UI_ROOT__ || document).addEventListener("pointermove", (e2)',
  ],
  [
    'document.addEventListener("pointerup", endPointerGesture)',
    '(window.__DAIMEOW_UI_ROOT__ || document).addEventListener("pointerup", endPointerGesture)',
  ],
  [
    'document.addEventListener("pointercancel", endPointerGesture)',
    '(window.__DAIMEOW_UI_ROOT__ || document).addEventListener("pointercancel", endPointerGesture)',
  ],
  [
    'document.addEventListener("contextmenu", (e2)',
    '(window.__DAIMEOW_UI_ROOT__ || document).addEventListener("contextmenu", (e2)',
  ],
  [
    'motionByName.set(file.replace(".motion3.json", ""), [group, index]);',
    [
      'const fallbackName = file.replace(".motion3.json", "");',
      '        const nameTable = window.__DAIMEOW_MOTION_NAMES__ || [];',
      '        let resolvedName = fallbackName;',
      '        for (const entry of nameTable) {',
      '          if (entry.group === group && entry.index === index) { resolvedName = entry.name; break; }',
      '        }',
      '        motionByName.set(resolvedName, [group, index]);',
    ].join('\n'),
  ],
  [
    'const handW = CHIPS_HAND_W * currentScale;\n    propChips.style.left = bagX + "px";',
    'const handW = CHIPS_HAND_W * currentScale;\n    propHandLeft.style.opacity = "1";\n    propHandRight.style.opacity = "1";\n    propChips.style.left = bagX + "px";',
  ],
];
for (const [from, to] of replacements) {
  const matched = typeof from === 'string' ? runtime.includes(from) : from.test(runtime);
  if (!matched) throw new Error(`Runtime patch target not found: ${String(from)}`);
  runtime = typeof from === 'string'
    ? runtime.replaceAll(from, to)
    : runtime.replace(from, to);
}

const template = await readFile(templatePath, 'utf8');
const dataBlock = [
  `const ASSET_DATA = ${JSON.stringify(assets)};`,
  `const MODEL_DOCUMENT = ${JSON.stringify(modelDocument)};`,
].join('\n');
const runtimeFunction = `function bootDaiMeowRuntime() {\n${runtime}\n}`;
const output = template
  .replace('__DAIMEOW_CLIENT_DATA__', () => dataBlock)
  .replace('__DAIMEOW_RUNTIME_FUNCTION__', () => runtimeFunction);

await writeFile(outputPath, output, 'utf8');
console.log(`Built ${outputPath} (${(Buffer.byteLength(output) / 1024 / 1024).toFixed(2)} MiB)`);
