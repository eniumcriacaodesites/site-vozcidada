import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4321);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * E2E contra o build de produção servido localmente (`astro preview` roda o
 * Worker no workerd). Para testar o preview da Cloudflare, defina E2E_BASE_URL.
 */
export default defineConfig({
    testDir: 'tests/e2e',
    fullyParallel: true,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL,
        trace: 'retain-on-failure',
        locale: 'pt-BR',
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile', use: { ...devices['Pixel 7'] } },
    ],
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
              command: `npm run preview -- --port ${PORT}`,
              url: baseURL,
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
          },
});
