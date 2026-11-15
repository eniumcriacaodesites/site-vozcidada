/**
 * Gera public/data/ibge/{UF}.json com os municípios de cada estado (IBGE),
 * usados no campo "Município" do formulário. Os arquivos são versionados;
 * rode novamente só quando o IBGE mudar a lista:
 *
 *   npm run ibge
 *
 * Fonte: https://servicodados.ibge.gov.br/api/v1/localidades/municipios
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API =
    'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'data', 'ibge');

const response = await fetch(API, {
    headers: { accept: 'application/json' },
});
if (!response.ok) {
    console.error(`IBGE respondeu ${response.status}`);
    process.exit(1);
}

/** @type {Array<{id:number,nome:string,microrregiao?:{mesorregiao:{UF:{sigla:string}}},'regiao-imediata'?:{'regiao-intermediaria':{UF:{sigla:string}}}}>} */
const municipios = await response.json();
const byUf = new Map();

for (const m of municipios) {
    const uf =
        m.microrregiao?.mesorregiao?.UF?.sigla ??
        m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla;
    if (!uf) continue;
    if (!byUf.has(uf)) byUf.set(uf, []);
    byUf.get(uf).push([String(m.id), m.nome]);
}

await mkdir(outDir, { recursive: true });
let total = 0;
for (const [uf, list] of [...byUf.entries()].sort()) {
    list.sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    total += list.length;
    await writeFile(join(outDir, `${uf}.json`), JSON.stringify(list));
}
console.log(`OK: ${total} municípios em ${byUf.size} UFs → ${outDir}`);
