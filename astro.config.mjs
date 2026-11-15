// @ts-check
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField, fontProviders } from 'astro/config';

/**
 * Branch do build no Cloudflare Workers Builds (vazio em build local).
 * As variáveis de build do painel valem para todas as branches; por isso o
 * preview (qualquer branch fora da `main`) liga noindex e avisos de pendência
 * por padrão. Uma variável definida explicitamente continua tendo prioridade.
 */
const ciBranch = process.env.WORKERS_CI_BRANCH ?? '';
const isPreviewBuild = ciBranch !== '' && ciBranch !== 'main';

/**
 * Site comercial do VozCidadã.
 *
 * Tudo é pré-renderizado (HTML estático na borda da Cloudflare); a única rota
 * sob demanda é `POST /api/lead` (`prerender = false`), que roda no Worker.
 */
export default defineConfig({
    site: 'https://vozcidada.enium.com.br',
    output: 'static',
    adapter: cloudflare({
        // Imagens otimizadas no build (sharp); em produção servidas como estão.
        imageService: 'compile',
        // Pré-renderização no Node: libs de build (ex.: QR code) usam APIs do Node.
        prerenderEnvironment: 'node',
    }),
    // Sem sessões: evita o provisionamento automático de KV pelo adaptador.
    session: false,
    integrations: [
        vue(),
        sitemap({
            filter: (page) =>
                !page.endsWith('/og/') &&
                !page.includes('/apresentacao') &&
                !page.includes('/obrigado'),
        }),
    ],
    fonts: [
        {
            provider: fontProviders.local(),
            name: 'Plus Jakarta Sans',
            cssVariable: '--font-jakarta',
            fallbacks: ['system-ui', 'sans-serif'],
            options: {
                variants: [
                    {
                        src: [
                            '@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2',
                        ],
                        weight: '200 800',
                        style: 'normal',
                    },
                ],
            },
        },
    ],
    env: {
        schema: {
            PUBLIC_TURNSTILE_SITE_KEY: envField.string({
                context: 'client',
                access: 'public',
                // Chave de teste da Cloudflare (sempre aprova) para dev/preview.
                default: '1x00000000000000000000AA',
            }),
            PUBLIC_WHATSAPP_NUMBER: envField.string({
                context: 'client',
                access: 'public',
                // Somente dígitos com DDI, ex.: 5579999999999. Vazio = botão oculto.
                default: '',
            }),
            PUBLIC_GOOGLE_PLAY_URL: envField.string({
                context: 'client',
                access: 'public',
                default:
                    'https://play.google.com/store/apps/details?id=br.com.vozcidada.app',
            }),
            PUBLIC_UMAMI_WEBSITE_ID: envField.string({
                context: 'client',
                access: 'public',
                default: '',
            }),
            // Mostra os avisos "Pendente de validação" (true em dev/preview).
            PUBLIC_SHOW_PENDING: envField.boolean({
                context: 'client',
                access: 'public',
                default: isPreviewBuild,
            }),
            // true no build de preview (branch dev): <meta robots noindex> em tudo.
            PUBLIC_NOINDEX: envField.boolean({
                context: 'client',
                access: 'public',
                default: isPreviewBuild,
            }),
        },
    },
    vite: {
        plugins: [tailwindcss()],
    },
    devToolbar: { enabled: false },
});
