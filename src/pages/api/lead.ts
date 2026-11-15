import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { handleLeadRequest, type RateLimiter } from '@/lib/lead/handler';

/** Única rota sob demanda do site: roda no Worker da Cloudflare. */
export const prerender = false;

type LeadEnv = Record<string, unknown> & {
    LEAD_RATE_LIMITER?: RateLimiter;
};

const str = (value: unknown): string =>
    typeof value === 'string' ? value : '';

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
    const e = env as unknown as LeadEnv;

    return handleLeadRequest(request, {
        config: {
            siteEnv: str(e.SITE_ENV) || 'production',
            turnstileSecret: str(e.TURNSTILE_SECRET_KEY),
            sendgridApiKey: str(e.SENDGRID_API_KEY),
            leadToEmail: str(e.LEAD_TO_EMAIL),
            leadFromEmail: str(e.LEAD_FROM_EMAIL),
            leadFromName: str(e.LEAD_FROM_NAME) || 'VozCidadã',
            sheetsWebhookUrl: str(e.SHEETS_WEBHOOK_URL),
            sheetsWebhookSecret: str(e.SHEETS_WEBHOOK_SECRET),
        },
        fetch: (input, init) => fetch(input, init),
        waitUntil: (promise) => locals.cfContext.waitUntil(promise),
        ip: clientAddress,
        rateLimiter: e.LEAD_RATE_LIMITER,
        log: (event, data) => console.log(JSON.stringify({ event, ...data })),
    });
};

export const ALL: APIRoute = () =>
    new Response(null, { status: 405, headers: { allow: 'POST' } });
