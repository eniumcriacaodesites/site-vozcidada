/**
 * Métricas de conversão desacopladas do provedor. Hoje envia para o Umami
 * (sem cookies) se estiver carregado; sem provedor, não faz nada.
 *
 * Eventos: cta_click, form_start, form_step, form_submit, form_error,
 * whatsapp_click, presentation_start, slide_view, pdf_download, store_click.
 */
type Payload = Record<string, string | number | boolean>;

interface UmamiLike {
    track: (event: string, data?: Payload) => void;
}

export function track(event: string, data?: Payload): void {
    try {
        const umami = (window as unknown as { umami?: UmamiLike }).umami;
        umami?.track(event, data);
    } catch {
        /* métricas nunca quebram a página */
    }
    if (import.meta.env.DEV) {
        console.debug('[track]', event, data ?? '');
    }
}

const ORIGIN_KEY = 'vc:origin';

/** Origem da visita (primeiro toque): UTMs, referrer e página de entrada. */
export function captureOrigin(): void {
    try {
        if (sessionStorage.getItem(ORIGIN_KEY)) {
            return;
        }
        const params = new URLSearchParams(location.search);
        const origin: Record<string, string> = {};
        for (const key of [
            'utm_source',
            'utm_medium',
            'utm_campaign',
            'utm_content',
            'utm_term',
        ]) {
            const value = params.get(key);
            if (value) origin[key] = value.slice(0, 120);
        }
        if (
            document.referrer &&
            !document.referrer.startsWith(location.origin)
        ) {
            origin.referrer = document.referrer.slice(0, 300);
        }
        origin.landing = location.pathname;
        sessionStorage.setItem(ORIGIN_KEY, JSON.stringify(origin));
    } catch {
        /* armazenamento indisponível */
    }
}

export function readOrigin(): Record<string, string> {
    try {
        return JSON.parse(sessionStorage.getItem(ORIGIN_KEY) ?? '{}');
    } catch {
        return {};
    }
}

/** Liga os cliques em [data-track="evento:rótulo"] ao track(). */
export function bindTrackedClicks(): void {
    document.addEventListener('click', (event) => {
        const target = (event.target as Element | null)?.closest<HTMLElement>(
            '[data-track]',
        );
        if (!target?.dataset.track) {
            return;
        }
        const [name, label] = target.dataset.track.split(':');
        track(name, label ? { posicao: label } : undefined);
    });
}
