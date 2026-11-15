import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Serviços externos (VLibras/Turnstile) não fazem parte do teste.
test.beforeEach(async ({ page }) => {
    await page.route(/vlibras\.gov\.br/, (route) => route.abort());
});

test.describe('landing', () => {
    test('todo o conteúdo aparece sem JavaScript', async ({ browser }) => {
        const context = await browser.newContext({ javaScriptEnabled: false });
        const page = await context.newPage();
        await page.goto('/');
        await expect(page.locator('main [data-slide]')).toHaveCount(17);
        await expect(page.getByRole('heading', { level: 1 })).toContainText(
            'O cidadão fala.',
        );
        for (const id of ['problema', 'ia', 'case', 'perguntas', 'contato']) {
            await expect(page.locator(`#${id} h2`)).toBeVisible();
        }
        await context.close();
    });

    test('movimento reduzido não carrega GSAP nem fixa seções', async ({
        page,
    }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto('/');
        await page.waitForTimeout(800);
        await expect(page.locator('.pin-spacer')).toHaveCount(0);
        await expect(page.locator('html.lenis')).toHaveCount(0);
    });

    test('botão "Pausar animações" persiste a escolha', async ({
        page,
        isMobile,
    }) => {
        test.skip(isMobile, 'no celular o botão fica no menu');
        await page.goto('/');
        await page.getByRole('button', { name: 'Pausar animações' }).click();
        await expect(page.locator('html')).toHaveAttribute(
            'data-motion',
            'off',
        );
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute(
            'data-motion',
            'off',
        );
    });

    test('sem violações de acessibilidade graves', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto('/');
        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .exclude('[data-pending]')
            .analyze();
        const serious = results.violations.filter((v) =>
            ['serious', 'critical'].includes(v.impact ?? ''),
        );
        expect(
            serious.map(
                (v) => `${v.id}: ${v.nodes.length} → ${v.nodes[0]?.target}`,
            ),
        ).toEqual([]);
    });
});

test.describe('formulário de demonstração', () => {
    test('valida as etapas e envia', async ({ page }) => {
        let body: Record<string, unknown> | null = null;
        await page.route('**/api/lead', async (route) => {
            body = route.request().postDataJSON();
            await route.fulfill({ json: { ok: true, id: 'teste' } });
        });
        // Turnstile simulado: entrega um token assim que renderizado.
        await page.route(/challenges\.cloudflare\.com/, (route) =>
            route.fulfill({
                contentType: 'application/javascript',
                body: 'window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback("token-teste"),50);return "w1"},reset:()=>{}};',
            }),
        );

        await page.goto('/#contato');
        // A ilha (client:visible) perde o atributo `ssr` ao hidratar; antes
        // disso o clique não aciona a validação.
        await expect(
            page.locator('#agendar astro-island').first(),
        ).not.toHaveAttribute('ssr');
        const form = page.locator('#agendar form');
        await form.getByRole('button', { name: 'Continuar' }).click();
        await expect(form.getByText('Selecione o estado.')).toBeVisible();

        await form.getByLabel('Estado').selectOption('SE');
        await form.getByLabel('Município').fill('Nossa Senhora da Glória');
        await form
            .getByLabel('Seu cargo ou área')
            .selectOption('Secretário(a)');
        await form.getByRole('button', { name: 'Continuar' }).click();

        await expect(form.getByText('Etapa 2 de 2')).toBeVisible();
        await form.getByLabel('Nome').fill('Maria da Silva');
        await form.getByLabel('WhatsApp').fill('79999991234');
        await expect(form.getByLabel('WhatsApp')).toHaveValue(
            '(79) 99999-1234',
        );
        await form.getByLabel('E-mail').fill('maria@prefeitura.se.gov.br');
        await form.getByText('Manhã').click();
        await form.getByRole('checkbox').check();
        await page.waitForTimeout(3100); // tempo mínimo de preenchimento (anti-robô)
        await form
            .getByRole('button', { name: 'Agendar minha demonstração' })
            .click();

        await page.waitForURL('**/obrigado**');
        expect(body).toMatchObject({
            uf: 'SE',
            municipio: 'Nossa Senhora da Glória',
            municipioIbge: '2804508',
            turnstileToken: 'token-teste',
            website: '',
        });
    });
});

test('resolve o código IBGE mesmo se o município vier antes da lista', async ({
    page,
}) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/data/ibge/SE.json', async (route) => {
        await gate;
        await route.continue();
    });

    await page.goto('/#contato');
    await expect(
        page.locator('#agendar astro-island').first(),
    ).not.toHaveAttribute('ssr');
    const form = page.locator('#agendar form');
    await form.getByLabel('Estado').selectOption('SE');
    await form.getByLabel('Município').fill('Nossa Senhora da Glória');
    const ibgeLoaded = page.waitForResponse('**/data/ibge/SE.json');
    release();
    await ibgeLoaded;

    await expect(form.locator('input[name="municipioIbge"]')).toHaveValue(
        '2804508',
    );
});

test.describe('modo apresentação', () => {
    test('teclado, etapas e deep link', async ({ page, isMobile }) => {
        test.skip(isMobile, 'apresentação é para tela grande');
        await page.goto('/apresentacao/#/2');
        const active = page.locator('[data-deck-slide][data-active]');
        await expect(active).toHaveAttribute('data-slide', 'problema');
        await expect(active.locator('[data-build="1"]')).not.toHaveAttribute(
            'data-built',
            '',
        );

        await page.keyboard.press('ArrowRight');
        await expect(active.locator('[data-build="1"]')).toHaveAttribute(
            'data-built',
            '',
        );
        await expect(page).toHaveURL(/#\/2\/1$/);

        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        await expect(
            page.locator('[data-deck-slide][data-active]'),
        ).toHaveAttribute('data-slide', 'inicio');

        await page.keyboard.type('14');
        await page.keyboard.press('Enter');
        await expect(
            page.locator('[data-deck-slide][data-active]'),
        ).toHaveAttribute('data-slide', 'contato');
        await expect(
            page.locator('[data-deck-slide][data-active] svg').first(),
        ).toBeVisible();

        await page.keyboard.press('o');
        await expect(
            page.getByRole('dialog', { name: 'Visão geral dos slides' }),
        ).toBeVisible();
    });
});

test('endpoint recusa GET', async ({ request }) => {
    const response = await request.get('/api/lead');
    expect(response.status()).toBe(405);
});
