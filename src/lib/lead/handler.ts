import { escapeHtml, sheetSafe } from './escape';
import { formatPhone, validateLead, type LeadInput } from './validate';

/**
 * Tratamento do POST /api/lead, independente do runtime (testável no
 * Vitest). O endpoint do Astro só injeta env, fetch e waitUntil.
 *
 * Fluxo: valida → anti-bot (honeypot, tempo mínimo, Turnstile, rate limit)
 * → entrega em paralelo (e-mail ao comercial + planilha) → auto-resposta.
 * Sucesso se ao menos um destino gravou. Logs sem dados pessoais.
 */

export interface LeadConfig {
    siteEnv: string;
    turnstileSecret: string;
    sendgridApiKey: string;
    leadToEmail: string;
    leadFromEmail: string;
    leadFromName: string;
    sheetsWebhookUrl: string;
    sheetsWebhookSecret: string;
}

export interface RateLimiter {
    limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface LeadDeps {
    config: LeadConfig;
    fetch: typeof fetch;
    waitUntil: (promise: Promise<unknown>) => void;
    ip?: string;
    rateLimiter?: RateLimiter;
    now?: () => number;
    log?: (event: string, data?: Record<string, unknown>) => void;
}

const MIN_FILL_MS = 3000;

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
        },
    });
}

async function readBody(
    request: Request,
): Promise<{ data: Record<string, unknown>; isForm: boolean }> {
    const type = request.headers.get('content-type') ?? '';
    if (type.includes('application/json')) {
        const data = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
        >;
        return { data, isForm: false };
    }
    const form = await request.formData();
    const data: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
        if (typeof value === 'string') {
            data[key] = value;
        }
    }
    data.origem = {};
    return { data, isForm: true };
}

export async function verifyTurnstile(
    deps: Pick<LeadDeps, 'fetch' | 'config' | 'ip'>,
    token: string,
): Promise<boolean> {
    if (!deps.config.turnstileSecret || !token) {
        return false;
    }
    const body = new URLSearchParams({
        secret: deps.config.turnstileSecret,
        response: token,
    });
    if (deps.ip) {
        body.set('remoteip', deps.ip);
    }
    try {
        const response = await deps.fetch(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            { method: 'POST', body },
        );
        const result = (await response.json()) as { success?: boolean };
        return result.success === true;
    } catch {
        return false;
    }
}

export function leadSummaryLines(lead: LeadInput): [string, string][] {
    return [
        ['Nome', lead.nome],
        ['Cargo/área', lead.cargo],
        ['Município', `${lead.municipio} — ${lead.uf}`],
        ['Código IBGE', lead.municipioIbge || '—'],
        ['WhatsApp', formatPhone(lead.whatsapp)],
        ['E-mail', lead.email],
        ['Melhor período', lead.periodo],
        ['Origem', describeOrigin(lead)],
    ];
}

function describeOrigin(lead: LeadInput): string {
    const o = lead.origem;
    const parts = [
        o.utm_source && `utm_source=${o.utm_source}`,
        o.utm_medium && `utm_medium=${o.utm_medium}`,
        o.utm_campaign && `utm_campaign=${o.utm_campaign}`,
        o.modo && `modo=${o.modo}`,
        o.slide && `seção=${o.slide}`,
        o.referrer && `referrer=${o.referrer}`,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'direto';
}

export function salesEmailHtml(lead: LeadInput): string {
    const rows = leadSummaryLines(lead)
        .map(
            ([label, value]) =>
                `<tr><td style="padding:6px 12px;color:#5b6779">${escapeHtml(label)}</td><td style="padding:6px 12px;font-weight:600;color:#0f1b2d">${escapeHtml(value)}</td></tr>`,
        )
        .join('');
    return `<div style="font-family:Arial,sans-serif"><h2 style="color:#0c2a4d">Novo pedido de demonstração</h2><table style="border-collapse:collapse">${rows}</table></div>`;
}

export function salesEmailText(lead: LeadInput): string {
    return [
        'Novo pedido de demonstração — VozCidadã',
        '',
        ...leadSummaryLines(lead).map(([label, value]) => `${label}: ${value}`),
    ].join('\n');
}

async function sendEmail(
    deps: LeadDeps,
    message: {
        to: string;
        subject: string;
        text: string;
        html: string;
        replyTo?: { email: string; name?: string };
    },
): Promise<void> {
    const { config } = deps;
    const response = await deps.fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${config.sendgridApiKey}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            personalizations: [{ to: [{ email: message.to }] }],
            from: { email: config.leadFromEmail, name: config.leadFromName },
            reply_to: message.replyTo,
            subject: message.subject,
            content: [
                { type: 'text/plain', value: message.text },
                { type: 'text/html', value: message.html },
            ],
        }),
    });
    if (!response.ok) {
        throw new Error(`sendgrid ${response.status}`);
    }
}

async function appendToSheet(
    deps: LeadDeps,
    lead: LeadInput,
    leadId: string,
): Promise<void> {
    const { config } = deps;
    const o = lead.origem;
    const row = {
        id: leadId,
        recebidoEm: new Date(deps.now?.() ?? Date.now()).toISOString(),
        nome: lead.nome,
        cargo: lead.cargo,
        municipio: lead.municipio,
        uf: lead.uf,
        municipioIbge: lead.municipioIbge,
        whatsapp: formatPhone(lead.whatsapp),
        email: lead.email,
        periodo: lead.periodo,
        utmSource: o.utm_source ?? '',
        utmMedium: o.utm_medium ?? '',
        utmCampaign: o.utm_campaign ?? '',
        referrer: o.referrer ?? '',
        landing: o.landing ?? '',
        slide: o.slide ?? '',
        modo: o.modo ?? '',
    };
    const safeRow = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, sheetSafe(value)]),
    );
    const response = await deps.fetch(config.sheetsWebhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            secret: config.sheetsWebhookSecret,
            row: safeRow,
        }),
        redirect: 'follow',
    });
    if (!response.ok) {
        throw new Error(`sheets ${response.status}`);
    }
    const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
    };
    if (result.ok !== true) {
        throw new Error('sheets rejected');
    }
}

function confirmationEmail(lead: LeadInput): {
    subject: string;
    text: string;
    html: string;
} {
    const first = lead.nome.split(' ')[0] ?? lead.nome;
    const text = [
        `Olá, ${first}!`,
        '',
        `Recebemos seu pedido de demonstração do VozCidadã para ${lead.municipio} (${lead.uf}).`,
        'Nossa equipe vai entrar em contato pelo WhatsApp informado para combinar o melhor horário.',
        '',
        'Equipe VozCidadã',
    ].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;color:#0f1b2d"><p>Olá, ${escapeHtml(first)}!</p><p>Recebemos seu pedido de demonstração do <b>VozCidadã</b> para ${escapeHtml(lead.municipio)} (${escapeHtml(lead.uf)}).</p><p>Nossa equipe vai entrar em contato pelo WhatsApp informado para combinar o melhor horário.</p><p>Equipe VozCidadã</p></div>`;
    return {
        subject: 'Recebemos seu pedido de demonstração — VozCidadã',
        text,
        html,
    };
}

export async function handleLeadRequest(
    request: Request,
    deps: LeadDeps,
): Promise<Response> {
    const log = deps.log ?? (() => {});
    const leadId = crypto.randomUUID();

    let parsed: { data: Record<string, unknown>; isForm: boolean };
    try {
        parsed = await readBody(request);
    } catch {
        return json({ ok: false, error: 'invalid_body' }, 400);
    }
    const { data, isForm } = parsed;
    const respond = (body: Record<string, unknown>, status = 200) =>
        isForm
            ? Response.redirect(
                  new URL(
                      body.ok ? '/obrigado' : '/#contato',
                      request.url,
                  ).toString(),
                  303,
              )
            : json(body, status);

    // Honeypot e tempo mínimo de preenchimento: finge sucesso para o robô.
    const elapsed = Number(data.t ?? 0);
    if (
        (typeof data.website === 'string' && data.website.trim() !== '') ||
        (Number.isFinite(elapsed) && elapsed > 0 && elapsed < MIN_FILL_MS)
    ) {
        log('lead_spam', { leadId, reason: 'honeypot_or_fast' });
        return respond({ ok: true });
    }

    if (deps.rateLimiter && deps.ip) {
        const { success } = await deps.rateLimiter.limit({ key: deps.ip });
        if (!success) {
            log('lead_rate_limited', { leadId });
            return respond({ ok: false, error: 'rate_limited' }, 429);
        }
    }

    const validation = validateLead(data);
    if (!validation.ok) {
        return respond(
            { ok: false, error: 'validation', fields: validation.errors },
            422,
        );
    }
    const lead = validation.data;

    const token =
        typeof data.turnstileToken === 'string' ? data.turnstileToken : '';
    if (!(await verifyTurnstile(deps, token))) {
        log('lead_captcha_failed', { leadId });
        return respond({ ok: false, error: 'captcha' }, 400);
    }

    const { config } = deps;
    const canEmail = Boolean(
        config.sendgridApiKey && config.leadToEmail && config.leadFromEmail,
    );
    const canSheet = Boolean(
        config.sheetsWebhookUrl && config.sheetsWebhookSecret,
    );

    if (!canEmail && !canSheet) {
        if (config.siteEnv === 'production') {
            log('lead_no_destination', { leadId });
            return respond({ ok: false, error: 'unavailable' }, 503);
        }
        log('lead_accepted_dev', { leadId });
        return respond({ ok: true, id: leadId });
    }

    const tasks: Promise<void>[] = [];
    if (canEmail) {
        tasks.push(
            sendEmail(deps, {
                to: config.leadToEmail,
                subject: `Demonstração: ${lead.municipio}/${lead.uf} — ${lead.cargo}`,
                text: salesEmailText(lead),
                html: salesEmailHtml(lead),
                replyTo: { email: lead.email, name: lead.nome },
            }),
        );
    }
    if (canSheet) {
        tasks.push(appendToSheet(deps, lead, leadId));
    }

    const results = await Promise.allSettled(tasks);
    const delivered = results.filter((r) => r.status === 'fulfilled').length;
    log('lead_delivery', {
        leadId,
        delivered,
        failed: results
            .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
            .map((r) => String(r.reason?.message ?? r.reason)),
    });

    if (delivered === 0) {
        return respond({ ok: false, error: 'delivery_failed' }, 502);
    }

    if (canEmail) {
        const confirmation = confirmationEmail(lead);
        deps.waitUntil(
            sendEmail(deps, { to: lead.email, ...confirmation }).catch(() => {
                log('lead_confirmation_failed', { leadId });
            }),
        );
    }

    return respond({ ok: true, id: leadId });
}
