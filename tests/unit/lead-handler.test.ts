import { describe, expect, it, vi } from 'vitest';

import { escapeHtml, sheetSafe } from '../../src/lib/lead/escape';
import {
    handleLeadRequest,
    salesEmailHtml,
    type LeadConfig,
    type LeadDeps,
} from '../../src/lib/lead/handler';
import { validateLead } from '../../src/lib/lead/validate';

const config: LeadConfig = {
    siteEnv: 'production',
    turnstileSecret: 'secret',
    sendgridApiKey: 'SG.key',
    leadToEmail: 'comercial@enium.com.br',
    leadFromEmail: 'site@enium.com.br',
    leadFromName: 'VozCidadã',
    sheetsWebhookUrl: 'https://script.google.com/macros/s/abc/exec',
    sheetsWebhookSecret: 'sheet-secret',
};

const payload = {
    uf: 'SE',
    municipio: 'Aracaju',
    municipioIbge: '2800308',
    cargo: 'Prefeito(a)',
    nome: 'João <b>Souza</b>',
    whatsapp: '79999991234',
    email: 'joao@aracaju.se.gov.br',
    periodo: 'Tarde',
    consentimento: true,
    turnstileToken: 'token-ok',
    t: 15000,
    origem: { utm_source: 'linkedin' },
};

function request(body: unknown, type = 'application/json'): Request {
    return new Request('https://vozcidada.enium.com.br/api/lead', {
        method: 'POST',
        headers: { 'content-type': type },
        body:
            type === 'application/json'
                ? JSON.stringify(body)
                : (body as BodyInit),
    });
}

type Handler = (url: string, init?: RequestInit) => Response;

function deps(
    overrides: Partial<LeadDeps> = {},
    handlers: Record<string, Handler> = {},
) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            calls.push({ url, init });
            for (const [prefix, handler] of Object.entries(handlers)) {
                if (url.startsWith(prefix)) return handler(url, init);
            }
            if (url.includes('turnstile'))
                return Response.json({ success: true });
            if (url.includes('sendgrid'))
                return new Response(null, { status: 202 });
            if (url.includes('script.google.com'))
                return Response.json({ ok: true });
            return new Response('not found', { status: 404 });
        },
    );
    const waited: Promise<unknown>[] = [];
    const d: LeadDeps = {
        config,
        fetch: fetchMock as unknown as typeof fetch,
        waitUntil: (p) => waited.push(p),
        ip: '203.0.113.7',
        ...overrides,
    };
    return { d, calls, waited };
}

describe('escape', () => {
    it('escapa HTML', () => {
        expect(escapeHtml(`<img src=x onerror="a('b')">`)).toBe(
            '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;',
        );
    });

    it('neutraliza injeção de fórmula em planilha', () => {
        expect(sheetSafe('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
        expect(sheetSafe('+55 79')).toBe(`'+55 79`);
        expect(sheetSafe('Maria')).toBe('Maria');
    });

    it('e-mail ao comercial não contém HTML do usuário sem escape', () => {
        const lead = validateLead(payload);
        if (!lead.ok) throw new Error('payload inválido');
        const html = salesEmailHtml(lead.data);
        expect(html).toContain('João &lt;b&gt;Souza&lt;/b&gt;');
        expect(html).not.toContain('<b>Souza</b>');
    });
});

describe('POST /api/lead', () => {
    it('entrega por e-mail e planilha e envia confirmação', async () => {
        const { d, calls, waited } = deps();
        const response = await handleLeadRequest(request(payload), d);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ ok: true });

        const sheet = calls.find((c) => c.url.includes('script.google.com'));
        const body = JSON.parse(String(sheet?.init?.body));
        expect(body.secret).toBe('sheet-secret');
        expect(body.row.whatsapp).toBe('(79) 99999-1234');
        expect(body.row.utmSource).toBe('linkedin');

        expect(calls.filter((c) => c.url.includes('sendgrid'))).toHaveLength(2);
        expect(waited).toHaveLength(1);
    });

    it('finge sucesso para robô (honeypot) sem entregar nada', async () => {
        const { d, calls } = deps();
        const response = await handleLeadRequest(
            request({ ...payload, website: 'spam.com' }),
            d,
        );
        expect(response.status).toBe(200);
        expect(calls).toHaveLength(0);
    });

    it('finge sucesso quando o envio é rápido demais', async () => {
        const { d, calls } = deps();
        const response = await handleLeadRequest(
            request({ ...payload, t: 800 }),
            d,
        );
        expect(response.status).toBe(200);
        expect(calls).toHaveLength(0);
    });

    it('recusa quando o Turnstile falha', async () => {
        const { d } = deps(
            {},
            {
                'https://challenges.cloudflare.com': () =>
                    Response.json({ success: false }),
            },
        );
        const response = await handleLeadRequest(request(payload), d);
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: 'captcha' });
    });

    it('devolve 422 com erros por campo', async () => {
        const { d } = deps();
        const response = await handleLeadRequest(
            request({ ...payload, email: 'x' }),
            d,
        );
        expect(response.status).toBe(422);
        const body = (await response.json()) as {
            fields: Record<string, string>;
        };
        expect(body.fields.email).toBeDefined();
    });

    it('respeita o rate limit', async () => {
        const { d } = deps({
            rateLimiter: { limit: async () => ({ success: false }) },
        });
        const response = await handleLeadRequest(request(payload), d);
        expect(response.status).toBe(429);
    });

    it('sucesso parcial: planilha fora do ar, e-mail entregue', async () => {
        const { d } = deps(
            {},
            {
                'https://script.google.com': () =>
                    new Response('erro', { status: 500 }),
            },
        );
        const response = await handleLeadRequest(request(payload), d);
        expect(response.status).toBe(200);
    });

    it('falha total devolve 502 (a tela oferece o WhatsApp)', async () => {
        const { d } = deps(
            {},
            {
                'https://script.google.com': () =>
                    new Response('erro', { status: 500 }),
                'https://api.sendgrid.com': () =>
                    new Response('erro', { status: 500 }),
            },
        );
        const response = await handleLeadRequest(request(payload), d);
        expect(response.status).toBe(502);
    });

    it('em produção, sem destino configurado, devolve 503', async () => {
        const { d } = deps({
            config: { ...config, sendgridApiKey: '', sheetsWebhookUrl: '' },
        });
        const response = await handleLeadRequest(request(payload), d);
        expect(response.status).toBe(503);
    });

    it('formulário sem JS redireciona (303) para /obrigado', async () => {
        const { d } = deps();
        const form = new URLSearchParams({
            ...Object.fromEntries(
                Object.entries(payload)
                    .filter(([k]) => k !== 'origem')
                    .map(([k, v]) => [k, String(v)]),
            ),
            consentimento: 'on',
        });
        const response = await handleLeadRequest(
            request(form, 'application/x-www-form-urlencoded'),
            d,
        );
        expect(response.status).toBe(303);
        expect(response.headers.get('location')).toBe(
            'https://vozcidada.enium.com.br/obrigado',
        );
    });
});
