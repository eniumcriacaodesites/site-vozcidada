/**
 * Gera IDs únicos (determinísticos dentro de um build) para referências
 * internas de SVG (gradientes/clipPaths) que aparecem várias vezes na página.
 */
let counter = 0;

export function uid(prefix: string): string {
    counter += 1;
    return `${prefix}-${counter}`;
}
