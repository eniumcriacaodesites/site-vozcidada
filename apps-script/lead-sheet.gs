/**
 * Web App do Google Apps Script que grava os pedidos de demonstração do site
 * VozCidadã numa planilha (aba "Leads").
 *
 * Implantação (uma vez, pela conta Google do comercial):
 * 1. Crie a planilha → Extensões → Apps Script → cole este arquivo.
 * 2. Configurações do projeto → Propriedades do script:
 *      WEBHOOK_SECRET = <mesmo valor do segredo SHEETS_WEBHOOK_SECRET no Worker>
 * 3. Implantar → Nova implantação → Tipo "App da Web":
 *      Executar como: Eu · Quem pode acessar: Qualquer pessoa
 * 4. Copie a URL /exec para a variável SHEETS_WEBHOOK_URL do Worker.
 *
 * O Worker já neutraliza injeção de fórmula; aqui repetimos por segurança.
 */
const SHEET_NAME = 'Leads';
const HEADERS = [
    'id',
    'recebidoEm',
    'nome',
    'cargo',
    'municipio',
    'uf',
    'municipioIbge',
    'whatsapp',
    'email',
    'periodo',
    'utmSource',
    'utmMedium',
    'utmCampaign',
    'referrer',
    'landing',
    'slide',
    'modo',
    'status do contato',
];

function doPost(e) {
    const secret =
        PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    let body;
    try {
        body = JSON.parse(e.postData.contents);
    } catch (err) {
        return reply({ ok: false, error: 'invalid_json' });
    }
    if (!secret || body.secret !== secret || !body.row) {
        return reply({ ok: false, error: 'unauthorized' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
        const book = SpreadsheetApp.getActiveSpreadsheet();
        const sheet =
            book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
        if (sheet.getLastRow() === 0) {
            sheet.appendRow(HEADERS);
            sheet.setFrozenRows(1);
        }
        const row = HEADERS.map((key) =>
            key === 'status do contato' ? 'novo' : safe(body.row[key]),
        );
        sheet.appendRow(row);
    } finally {
        lock.releaseLock();
    }
    return reply({ ok: true });
}

function safe(value) {
    const text = String(value == null ? '' : value).slice(0, 300);
    return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

function reply(data) {
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
        ContentService.MimeType.JSON,
    );
}
