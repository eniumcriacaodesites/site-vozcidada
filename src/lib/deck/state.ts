/**
 * Máquina de estados do Modo Apresentação (pura, testável).
 *
 * Cada slide tem N "etapas" (animações "ao clicar", via data-build). Avançar
 * revela a próxima etapa; sem etapas restantes, vai ao próximo slide (que
 * começa sem etapas). Voltar esconde a última etapa; no início do slide,
 * volta ao slide anterior JÁ COMPLETO — como no PowerPoint.
 */
export interface DeckState {
    /** Índice do slide (0-based). */
    slide: number;
    /** Quantas etapas já foram reveladas no slide atual. */
    build: number;
}

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

export function nextState(state: DeckState, builds: number[]): DeckState {
    const total = builds[state.slide] ?? 0;
    if (state.build < total) {
        return { slide: state.slide, build: state.build + 1 };
    }
    if (state.slide < builds.length - 1) {
        return { slide: state.slide + 1, build: 0 };
    }
    return state;
}

export function prevState(state: DeckState, builds: number[]): DeckState {
    if (state.build > 0) {
        return { slide: state.slide, build: state.build - 1 };
    }
    if (state.slide > 0) {
        const previous = state.slide - 1;
        return { slide: previous, build: builds[previous] ?? 0 };
    }
    return state;
}

export function gotoSlide(
    index: number,
    builds: number[],
    complete = false,
): DeckState {
    const slide = clamp(index, 0, Math.max(0, builds.length - 1));
    return { slide, build: complete ? (builds[slide] ?? 0) : 0 };
}

/** "#/3/2" → slide 3 (1-based), etapa 2. Valores fora do intervalo são ajustados. */
export function parseHash(hash: string, builds: number[]): DeckState {
    const match = /^#\/(\d+)(?:\/(\d+))?$/.exec(hash.trim());
    if (!match) {
        return { slide: 0, build: 0 };
    }
    const slide = clamp(
        Number(match[1]) - 1,
        0,
        Math.max(0, builds.length - 1),
    );
    const build = clamp(Number(match[2] ?? 0), 0, builds[slide] ?? 0);
    return { slide, build };
}

export function toHash(state: DeckState): string {
    return state.build > 0
        ? `#/${state.slide + 1}/${state.build}`
        : `#/${state.slide + 1}`;
}

/** Níveis distintos de data-build (ex.: [1,1,2,5] → [1,2,5]). */
export function buildLevels(values: number[]): number[] {
    return [...new Set(values.filter((v) => Number.isFinite(v) && v > 0))].sort(
        (a, b) => a - b,
    );
}
