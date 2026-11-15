/** Escapa texto para HTML (e-mails). Nunca interpolar dado do usuário sem isto. */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Neutraliza injeção de fórmula em planilhas (CSV/Sheets): valores que
 * começam com = + - @ (ou tab/CR) viram texto com um apóstrofo na frente.
 */
export function sheetSafe(value: string): string {
    return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
