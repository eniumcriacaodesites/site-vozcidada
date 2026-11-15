import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

import { iconNames } from './lib/icons';

/**
 * Coleção "slides": uma fonte de verdade para o modo web (landing) e para o
 * Modo Apresentação. O frontmatter guarda os textos de cada slide; o corpo do
 * Markdown guarda as NOTAS DO APRESENTADOR (roteiro do pitch).
 *
 * Regra de veracidade: só descrever o que existe no produto (ver AGENTS.md).
 */
const item = z.object({
    title: z.string(),
    text: z.string().optional(),
    icon: z.enum(iconNames).optional(),
});

const slides = defineCollection({
    loader: glob({ pattern: '*.md', base: './src/content/slides' }),
    schema: z.object({
        order: z.number().int().positive(),
        /** Rótulo curto para a navegação lateral e o contador. */
        navLabel: z.string().max(28),
        theme: z.enum(['dark', 'light']),
        /** main = entra no deck; backup = slide de reserva no fim; web = só no site. */
        deck: z.enum(['main', 'backup', 'web']).default('main'),
        kicker: z.string().optional(),
        title: z.string(),
        lead: z.string().optional(),
        items: z.array(item).default([]),
        cards: z.array(z.string()).default([]),
        closing: z.array(z.string()).default([]),
        badges: z.array(z.string()).default([]),
        footnote: z.string().optional(),
        faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
        metrics: z
            .array(
                z.object({
                    value: z.string(),
                    label: z.string(),
                    note: z.string().optional(),
                }),
            )
            .default([]),
        testimonial: z
            .object({
                quote: z.string(),
                name: z.string(),
                role: z.string(),
            })
            .optional(),
        /** Pendências de validação (comercial/jurídico/cliente). Não aparecem na página. */
        pending: z.array(z.string()).default([]),
    }),
});

export const collections = { slides };
