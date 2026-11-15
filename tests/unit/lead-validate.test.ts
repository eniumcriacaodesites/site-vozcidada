import { describe, expect, it } from 'vitest';

import {
    formatPhone,
    isValidBrPhone,
    isValidEmail,
    normalizePhone,
    validateLead,
    validateStep1,
    validateStep2,
} from '../../src/lib/lead/validate';

const valid = {
    uf: 'SE',
    municipio: 'Nossa Senhora da Glória',
    municipioIbge: '2804508',
    cargo: 'Secretário(a)',
    nome: 'Maria da Silva',
    whatsapp: '(79) 99999-1234',
    email: 'Maria@Prefeitura.se.gov.br',
    periodo: 'Manhã',
    consentimento: true,
    origem: { utm_source: 'google', slide: 'contato', ignorado: 'x' },
};

describe('telefone', () => {
    it('normaliza removendo máscara e DDI 55', () => {
        expect(normalizePhone('+55 (79) 99999-1234')).toBe('79999991234');
    });

    it('aceita celular (11 dígitos começando com 9) e fixo (10 dígitos)', () => {
        expect(isValidBrPhone('(79) 99999-1234')).toBe(true);
        expect(isValidBrPhone('(79) 3211-1234')).toBe(true);
    });

    it('rejeita DDD inválido, celular sem 9 e dígitos repetidos', () => {
        expect(isValidBrPhone('(09) 99999-1234')).toBe(false);
        expect(isValidBrPhone('(79) 89999-1234')).toBe(false);
        expect(isValidBrPhone('(79) 99999-999')).toBe(false);
        expect(isValidBrPhone('(79) 99999-9999')).toBe(false);
    });

    it('formata progressivamente', () => {
        expect(formatPhone('79')).toBe('(79');
        expect(formatPhone('799999')).toBe('(79) 9999');
        expect(formatPhone('7932111234')).toBe('(79) 3211-1234');
        expect(formatPhone('79999991234')).toBe('(79) 99999-1234');
    });
});

describe('e-mail', () => {
    it('valida formatos comuns', () => {
        expect(isValidEmail('a@b.gov.br')).toBe(true);
        expect(isValidEmail('sem-arroba.gov.br')).toBe(false);
        expect(isValidEmail('a@b')).toBe(false);
        expect(isValidEmail('<script>@x.com')).toBe(false);
    });
});

describe('etapas do formulário', () => {
    it('etapa 1 exige UF válida, município e cargo da lista', () => {
        expect(
            validateStep1({ uf: 'XX', municipio: '', cargo: 'Rei' }),
        ).toEqual({
            uf: expect.any(String),
            municipio: expect.any(String),
            cargo: expect.any(String),
        });
        expect(validateStep1(valid)).toEqual({});
    });

    it('etapa 2 exige consentimento', () => {
        const errors = validateStep2({ ...valid, consentimento: false });
        expect(errors.consentimento).toBeDefined();
    });
});

describe('validateLead (servidor)', () => {
    it('normaliza e descarta campos de origem desconhecidos', () => {
        const result = validateLead(valid);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.whatsapp).toBe('79999991234');
        expect(result.data.email).toBe('maria@prefeitura.se.gov.br');
        expect(result.data.origem).toEqual({
            utm_source: 'google',
            slide: 'contato',
        });
    });

    it('aceita consentimento vindo de formulário ("on")', () => {
        const result = validateLead({ ...valid, consentimento: 'on' });
        expect(result.ok).toBe(true);
    });

    it('limpa caracteres de controle e corta textos longos', () => {
        const result = validateLead({
            ...valid,
            nome: `Maria\u0000\n${'a'.repeat(500)}`,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.nome.length).toBeLessThanOrEqual(120);
        expect(result.data.nome).not.toMatch(/[\u0000\n]/);
    });

    it('rejeita payload vazio com erros por campo', () => {
        const result = validateLead(null);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(Object.keys(result.errors)).toEqual(
            expect.arrayContaining([
                'uf',
                'municipio',
                'cargo',
                'nome',
                'whatsapp',
                'email',
                'periodo',
                'consentimento',
            ]),
        );
    });
});
