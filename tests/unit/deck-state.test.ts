import { describe, expect, it } from 'vitest';

import {
    buildLevels,
    gotoSlide,
    nextState,
    parseHash,
    prevState,
    toHash,
} from '../../src/lib/deck/state';

// slide 0: sem etapas; slide 1: 2 etapas; slide 2: 1 etapa
const builds = [0, 2, 1];

describe('navegação do deck', () => {
    it('avança etapas antes de trocar de slide', () => {
        let s = { slide: 0, build: 0 };
        s = nextState(s, builds);
        expect(s).toEqual({ slide: 1, build: 0 });
        s = nextState(s, builds);
        expect(s).toEqual({ slide: 1, build: 1 });
        s = nextState(s, builds);
        expect(s).toEqual({ slide: 1, build: 2 });
        s = nextState(s, builds);
        expect(s).toEqual({ slide: 2, build: 0 });
    });

    it('não passa do último slide/etapa', () => {
        const end = { slide: 2, build: 1 };
        expect(nextState(end, builds)).toEqual(end);
    });

    it('voltar esconde etapas e, no início, abre o slide anterior completo', () => {
        expect(prevState({ slide: 1, build: 2 }, builds)).toEqual({
            slide: 1,
            build: 1,
        });
        expect(prevState({ slide: 2, build: 0 }, builds)).toEqual({
            slide: 1,
            build: 2,
        });
        expect(prevState({ slide: 0, build: 0 }, builds)).toEqual({
            slide: 0,
            build: 0,
        });
    });

    it('ir para slide ajusta o intervalo', () => {
        expect(gotoSlide(99, builds)).toEqual({ slide: 2, build: 0 });
        expect(gotoSlide(-3, builds)).toEqual({ slide: 0, build: 0 });
        expect(gotoSlide(1, builds, true)).toEqual({ slide: 1, build: 2 });
    });
});

describe('hash da URL', () => {
    it('ida e volta', () => {
        expect(toHash({ slide: 1, build: 0 })).toBe('#/2');
        expect(toHash({ slide: 1, build: 2 })).toBe('#/2/2');
        expect(parseHash('#/2/2', builds)).toEqual({ slide: 1, build: 2 });
    });

    it('valores inválidos ou fora do intervalo são ajustados', () => {
        expect(parseHash('', builds)).toEqual({ slide: 0, build: 0 });
        expect(parseHash('#contato', builds)).toEqual({ slide: 0, build: 0 });
        expect(parseHash('#/9/9', builds)).toEqual({ slide: 2, build: 1 });
    });
});

describe('níveis de etapa', () => {
    it('ordena e remove repetidos/ inválidos', () => {
        expect(buildLevels([3, 1, 1, 0, NaN, 2])).toEqual([1, 2, 3]);
    });
});
