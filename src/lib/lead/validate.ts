/**
 * Regras do formulário "Agendar demonstração" — compartilhadas entre o
 * navegador (ilha Vue) e o Worker (POST /api/lead). TypeScript puro, sem
 * dependências, para manter o JS do cliente pequeno e testável no Vitest.
 */

export const UFS = [
    'AC',
    'AL',
    'AM',
    'AP',
    'BA',
    'CE',
    'DF',
    'ES',
    'GO',
    'MA',
    'MG',
    'MS',
    'MT',
    'PA',
    'PB',
    'PE',
    'PI',
    'PR',
    'RJ',
    'RN',
    'RO',
    'RR',
    'RS',
    'SC',
    'SE',
    'SP',
    'TO',
] as const;

export const ROLES = [
    'Prefeito(a)',
    'Vice-prefeito(a)',
    'Secretário(a)',
    'Gabinete / assessoria',
    'Ouvidoria',
    'Comunicação',
    'Tecnologia da informação',
    'Outro',
] as const;

export const PERIODS = ['Manhã', 'Tarde', 'Qualquer horário'] as const;

export interface LeadOrigin {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    referrer?: string;
    landing?: string;
    slide?: string;
    modo?: string;
}

export interface LeadInput {
    uf: string;
    municipio: string;
    municipioIbge: string;
    cargo: string;
    nome: string;
    whatsapp: string;
    email: string;
    periodo: string;
    consentimento: boolean;
    origem: LeadOrigin;
}

export type LeadField = Exclude<keyof LeadInput, 'origem' | 'municipioIbge'>;
export type LeadErrors = Partial<Record<LeadField, string>>;

const ORIGIN_KEYS: (keyof LeadOrigin)[] = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'referrer',
    'landing',
    'slide',
    'modo',
];

/** Remove tudo que não for dígito; descarta o DDI 55 se vier junto. */
export function normalizePhone(value: string): string {
    let digits = value.replace(/\D/g, '');
    if (digits.length > 11 && digits.startsWith('55')) {
        digits = digits.slice(2);
    }
    return digits;
}

/** Celular ou fixo brasileiro com DDD (10 ou 11 dígitos; celular começa com 9). */
export function isValidBrPhone(value: string): boolean {
    const digits = normalizePhone(value);
    if (!/^\d{10,11}$/.test(digits)) {
        return false;
    }
    const ddd = Number(digits.slice(0, 2));
    if (ddd < 11 || ddd > 99) {
        return false;
    }
    if (digits.length === 11 && digits[2] !== '9') {
        return false;
    }
    return !/^(\d)\1+$/.test(digits.slice(2));
}

/** Máscara de exibição: (79) 99999-9999 / (79) 3333-3333. */
export function formatPhone(value: string): string {
    const d = normalizePhone(value).slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) {
        return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    }
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidEmail(value: string): boolean {
    return (
        value.length <= 254 &&
        /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(value)
    );
}

const clean = (value: unknown, max = 160): string =>
    typeof value === 'string'
        ? value
              .replace(/[\u0000-\u001f\u007f]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, max)
        : '';

export function validateStep1(input: Partial<LeadInput>): LeadErrors {
    const errors: LeadErrors = {};
    if (!UFS.includes(input.uf as (typeof UFS)[number])) {
        errors.uf = 'Selecione o estado.';
    }
    if (!input.municipio || input.municipio.trim().length < 2) {
        errors.municipio = 'Informe o município.';
    }
    if (!ROLES.includes(input.cargo as (typeof ROLES)[number])) {
        errors.cargo = 'Selecione o seu cargo ou área.';
    }
    return errors;
}

export function validateStep2(input: Partial<LeadInput>): LeadErrors {
    const errors: LeadErrors = {};
    if (!input.nome || input.nome.trim().length < 3) {
        errors.nome = 'Informe seu nome.';
    }
    if (!input.whatsapp || !isValidBrPhone(input.whatsapp)) {
        errors.whatsapp = 'Informe um WhatsApp com DDD, ex.: (79) 99999-9999.';
    }
    if (!input.email || !isValidEmail(input.email.trim())) {
        errors.email = 'Informe um e-mail válido.';
    }
    if (!PERIODS.includes(input.periodo as (typeof PERIODS)[number])) {
        errors.periodo = 'Escolha o melhor período.';
    }
    if (input.consentimento !== true) {
        errors.consentimento =
            'Precisamos da sua autorização para entrar em contato.';
    }
    return errors;
}

/**
 * Normaliza e valida o payload completo (vindo de JSON ou de formulário).
 * Nunca confia no cliente: limpa, corta e revalida tudo.
 */
export function validateLead(
    raw: unknown,
): { ok: true; data: LeadInput } | { ok: false; errors: LeadErrors } {
    const source = (raw && typeof raw === 'object' ? raw : {}) as Record<
        string,
        unknown
    >;
    const originRaw =
        source.origem && typeof source.origem === 'object'
            ? (source.origem as Record<string, unknown>)
            : {};

    const origem: LeadOrigin = {};
    for (const key of ORIGIN_KEYS) {
        const value = clean(originRaw[key], 300);
        if (value) {
            origem[key] = value;
        }
    }

    const consent = source.consentimento;
    const data: LeadInput = {
        uf: clean(source.uf, 2).toUpperCase(),
        municipio: clean(source.municipio, 80),
        municipioIbge: clean(source.municipioIbge, 7).replace(/\D/g, ''),
        cargo: clean(source.cargo, 40),
        nome: clean(source.nome, 120),
        whatsapp: normalizePhone(clean(source.whatsapp, 30)),
        email: clean(source.email, 254).toLowerCase(),
        periodo: clean(source.periodo, 30),
        consentimento:
            consent === true || consent === 'on' || consent === 'true',
        origem,
    };

    const errors = { ...validateStep1(data), ...validateStep2(data) };
    return Object.keys(errors).length > 0
        ? { ok: false, errors }
        : { ok: true, data };
}
