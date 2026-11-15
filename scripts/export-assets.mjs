/**
 * Gera, a partir do site rodando localmente, os arquivos estáticos derivados:
 *   - public/downloads/apresentacao-vozcidada.pdf (um slide por página)
 *   - public/og/vozcidada-og.png (imagem de compartilhamento 1200×630)
 *
 * Uso (com o build servido em outro terminal: npm run build && npm run preview):
 *   npm run assets:export            # usa http://localhost:4321
 *   npm run assets:export -- http://127.0.0.1:4321
 *
 * Depois, rode `npm run build` de novo para incluir os arquivos no dist.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const browser = await chromium.launch();
const block = (page) =>
    page.route(/vlibras\.gov\.br|challenges\.cloudflare\.com/, (r) =>
        r.abort(),
    );

// PDF da apresentação (CSS de impressão do /apresentacao).
const deck = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await block(deck);
await deck.goto(`${base}/apresentacao/`, { waitUntil: 'load' });
await deck.evaluate(() => document.fonts.ready);
await deck.emulateMedia({ media: 'print' });
const pdfPath = join(root, 'public', 'downloads', 'apresentacao-vozcidada.pdf');
await mkdir(dirname(pdfPath), { recursive: true });
await deck.pdf({
    path: pdfPath,
    width: '1920px',
    height: '1080px',
    printBackground: true,
    preferCSSPageSize: true,
});
console.log(`PDF: ${pdfPath}`);

// Imagem Open Graph.
const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await block(og);
await og.goto(`${base}/og/`, { waitUntil: 'load' });
await og.evaluate(() => document.fonts.ready);
const ogPath = join(root, 'public', 'og', 'vozcidada-og.png');
await mkdir(dirname(ogPath), { recursive: true });
await og.screenshot({
    path: ogPath,
    clip: { x: 0, y: 0, width: 1200, height: 630 },
});
console.log(`OG: ${ogPath}`);

await browser.close();
