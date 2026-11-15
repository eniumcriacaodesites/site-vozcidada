# Site VozCidadã — Guia do Agente

> Fonte de verdade do método de trabalho: `~/.claude/standards/` (WORKING_METHOD, STACK_PROFILES, PROMPT_LIBRARY).
> Este arquivo é lido por Antigravity, Cursor e Claude Code. Em conflito, o que está aqui prevalece para este repo.

## Perfil de stack

**P8** — Site estático/marketing (Astro + Tailwind + ilhas Vue + GSAP, Cloudflare Workers). Siga o bloco correspondente em `STACK_PROFILES.md`.

## Stack real

- Node **>= 22.23.4** (`.node-version`), Astro 7.4, `@astrojs/cloudflare` 14, `@astrojs/vue` 7 (Vue 3.5), Tailwind CSS 4.3 (`@tailwindcss/vite`), TypeScript 6.0 (strict).
- Movimento: GSAP 3.15 (ScrollTrigger, SplitText, Flip, DrawSVG — gratuitos) + Lenis 1.3.
- Fonte Plus Jakarta Sans (auto-hospedada pela Fonts API do Astro). Ícones Lucide (`lucide-static`, registro em `src/lib/icons.ts`).
- Testes: Vitest 5 (unit), Playwright 1.65 + axe (E2E). Lint: ESLint 10 + typescript-eslint, eslint-plugin-astro/vue. Prettier 3.

## Comandos

- Dev: `npm run dev` · Build: `npm run build` · Servir o build (Worker local): `npm run preview`
- Tipos: `npm run check` (gera `worker-configuration.d.ts`, `astro check` e `vue-tsc`)
- Lint/format: `npm run lint` · `npm run format`
- Testes: `npm test` (unit) · `npm run test:e2e` (sobe o preview sozinho; ou `E2E_BASE_URL=...`)
- Derivados: `npm run assets:export -- http://localhost:4321` (PDF do deck + imagem OG, com o preview rodando) · `npm run icons` · `npm run ibge`

## Estrutura

- **Conteúdo:** `src/content/slides/NN-ancora.md` — frontmatter = textos do slide; corpo = notas do apresentador; `pending` = o que falta validar.
- **Layout dos slides:** `src/components/slides/*` (um componente por âncora, registro em `registry.ts`). Telas simuladas em `components/mocks`, artes em `components/art`.
- **Páginas:** `src/pages/index.astro` (landing), `apresentacao.astro` (deck 1920×1080), `apresentacao/notas.astro` (modo apresentador), `obrigado`, `privacidade`, `404`, `og` (arte OG), `api/lead.ts` (única rota no Worker).
- **Lógica:** `src/lib/lead/*` (validação compartilhada + handler testável), `src/lib/deck/*` (máquina de estados + runtime), `src/lib/motion/` (GSAP/Lenis), `src/lib/site-behaviors.ts`.
- **Testes:** `tests/unit`, `tests/e2e`. Planilha de leads: `apps-script/lead-sheet.gs`.

## Specifics do projeto

- **Uma fonte, duas experiências:** o mesmo slide serve à landing (rolagem) e ao deck. Use **container queries** (`@3xl:`, `@5xl:`…) e unidades `cqi` dentro dos slides — nunca `md:`/`lg:` para layout interno, senão o palco 1920×1080 quebra. `data-build="n"` = etapa "ao clicar" no deck. Camadas de fundo vão no `slot="bg"` do `SlideSection`.
- **Regra de veracidade (crítica):** não prometer o que o produto não faz — GPS de equipe em tempo real, app nativo da equipe, avisos/atendimento por WhatsApp (só o código de login), conversa servidor↔cidadão, SLA com alertas, mapa público, "% satisfação", "IA aprova/rejeita", modo offline, "dados no Brasil"/"100% LGPD". Números só reais e autorizados (case Glória). Telas são ilustrativas e dizem isso.
- **Leads:** `POST /api/lead` → Turnstile + honeypot + tempo mínimo + rate limit (`LEAD_RATE_LIMITER`) → e-mail (SendGrid) e planilha (Apps Script) em paralelo; sucesso se um destino gravar. Todo dado do usuário em e-mail passa por `escapeHtml`; na planilha, por `sheetSafe`. Logs sem dados pessoais.
- **Variáveis:** públicas de build em `.env` local (ver `.env.example`, `astro:env`) e em "Build variables" no painel da Cloudflare. Do Worker: `LEAD_FROM_NAME`/`SITE_ENV` em `wrangler.jsonc`; `LEAD_TO_EMAIL`, `LEAD_FROM_EMAIL` e `SHEETS_WEBHOOK_URL` só no painel (`keep_vars: true` as preserva — não declare essas chaves no `wrangler.jsonc`, senão o deploy sobrescreve). Segredos via painel/`wrangler secret put`; local em `.dev.vars` (ver `.dev.vars.example`). `PUBLIC_SHOW_PENDING` e `PUBLIC_NOINDEX` ligam sozinhos em builds de branches fora da `main` (`WORKERS_CI_BRANCH`).
- **Movimento:** conteúdo sempre visível sem JS; GSAP só carrega com movimento permitido; `prefers-reduced-motion` e o botão "Pausar animações" desligam tudo.
- **Deploy:** Cloudflare Workers Builds ligado ao GitHub — `main` → `vozcidada.enium.com.br` (Custom Domain; a zona `enium.com.br` está na Cloudflare); `dev` → preview. Build `npm run build`; deploy `npx wrangler deploy`; outras branches `npx wrangler versions upload`. O `@astrojs/cloudflare` gera `dist/server/wrangler.json` (assets em `dist/client`), e o `wrangler` o encontra via `.wrangler/deploy/config.json`. Node pelo `.node-version`. Cabeçalhos/CSP em `public/_headers`.
- **PDF/OG:** depois de mudar conteúdo, rode `npm run assets:export` e versione `public/downloads/apresentacao-vozcidada.pdf` e `public/og/vozcidada-og.png`.
- **Melhoria futura:** migrar a CSP de `'unsafe-inline'` para hashes (`security.csp` do Astro) quando validado com o VLibras.

## Guardrails (além dos universais)

- Commits em PT-BR, Conventional Commits, **sem acentos**, na branch `dev`; merge na `main` só após validar no preview.
- Nunca versionar `.env`, `.dev.vars` ou chaves; o destinatário dos leads vem de variável, nunca fixo no código.
- Não usar as imagens de `vozcidada/public/images/fluxo/*` nem `landing/before.png` (marca d'água do Gemini, marcas de terceiros).
- Mudou texto de slide? Confira contra a regra de veracidade e mantenha `pending` atualizado.
