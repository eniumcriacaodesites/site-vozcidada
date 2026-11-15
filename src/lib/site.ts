import {
    PUBLIC_GOOGLE_PLAY_URL,
    PUBLIC_WHATSAPP_NUMBER,
} from 'astro:env/client';

/**
 * Dados institucionais e de contato do site.
 * Campos vazios = pendentes de informação do cliente (ver AGENTS.md).
 */
export const site = {
    name: 'VozCidadã',
    url: 'https://vozcidada.enium.com.br',
    title: 'VozCidadã — Zeladoria urbana inteligente para prefeituras',
    description:
        'Relatos com foto e local exato, triagem com inteligência artificial, ordem de serviço no celular da equipe e prova de antes e depois. Agende uma demonstração.',
    company: {
        name: 'Enium Tecnologia',
        /** Razão social, CNPJ e endereço: PENDENTE (informar antes do lançamento). */
        legalName: '',
        cnpj: '',
        address: '',
    },
    contactEmail: '',
    googlePlayUrl: PUBLIC_GOOGLE_PLAY_URL,
    whatsappNumber: PUBLIC_WHATSAPP_NUMBER.replace(/\D/g, ''),
    deckPdfPath: '/downloads/apresentacao-vozcidada.pdf',
} as const;

/**
 * Link do WhatsApp comercial com mensagem pronta e o contexto (seção/slide)
 * de onde a pessoa clicou. Retorna null se o número não estiver configurado.
 */
export function whatsappLink(context?: string): string | null {
    if (!site.whatsappNumber) {
        return null;
    }

    const where = context ? ` (seção: ${context})` : '';
    const text = `Olá! Estou vendo o site do VozCidadã${where} e quero agendar uma demonstração.`;

    return `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(text)}`;
}
