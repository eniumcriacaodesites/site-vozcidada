import { defineConfig } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
    {
        ignores: [
            'dist/',
            '.astro/',
            '.wrangler/',
            'node_modules/',
            'playwright-report/',
            'test-results/',
            'worker-configuration.d.ts',
            'apps-script/',
        ],
    },
    tseslint.configs.recommended,
    astro.configs.recommended,
    vue.configs['flat/essential'],
    {
        files: ['**/*.vue'],
        languageOptions: {
            parserOptions: { parser: tseslint.parser },
        },
    },
    {
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': [
                'error',
                { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
            ],
            'vue/multi-word-component-names': 'off',
        },
    },
);
