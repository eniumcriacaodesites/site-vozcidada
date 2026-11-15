/**
 * Gera os ícones PNG/ICO a partir de public/favicon.svg (sharp, já
 * instalado com o Astro). Rode quando a logo mudar:
 *
 *   node scripts/generate-icons.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(join(root, 'public', 'favicon.svg'));

const png = (size) =>
    sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

await writeFile(join(root, 'public', 'apple-touch-icon.png'), await png(180));
await writeFile(join(root, 'public', 'icon-192.png'), await png(192));
await writeFile(join(root, 'public', 'icon-512.png'), await png(512));

// favicon.ico com um PNG 32x32 embutido (formato aceito por todos os navegadores).
const ico32 = await png(32);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(32, 0);
entry.writeUInt8(32, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(ico32.length, 8);
entry.writeUInt32LE(6 + 16, 12);
await writeFile(
    join(root, 'public', 'favicon.ico'),
    Buffer.concat([header, entry, ico32]),
);

console.log(
    'OK: apple-touch-icon.png, icon-192.png, icon-512.png, favicon.ico',
);
