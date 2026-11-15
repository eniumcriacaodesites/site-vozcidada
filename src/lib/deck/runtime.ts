/**
 * Runtime do Modo Apresentação (/apresentacao): palco 1920×1080 escalado,
 * etapas "ao clicar", View Transitions entre slides, teclado/passador,
 * visão geral, tela preta, ajuda, tela cheia e sincronização com o modo
 * apresentador (/apresentacao/notas) via BroadcastChannel.
 */
import { track } from '@/lib/analytics';

import {
    buildLevels,
    gotoSlide,
    nextState,
    parseHash,
    prevState,
    toHash,
    type DeckState,
} from './state';

export const DECK_CHANNEL = 'vozcidada-deck';

export type DeckMessage =
    | { type: 'state'; slide: number; build: number; total: number }
    | { type: 'command'; action: 'next' | 'prev' | 'goto'; slide?: number }
    | { type: 'hello' };

const STAGE_W = 1920;
const STAGE_H = 1080;

const reduceMotion = () =>
    matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initDeck(): void {
    const stage = document.querySelector<HTMLElement>('[data-deck-stage]');
    const slides = [
        ...document.querySelectorAll<HTMLElement>('[data-deck-slide]'),
    ];
    if (!stage || !slides.length) return;

    const announcer = document.querySelector<HTMLElement>(
        '[data-deck-announcer]',
    );
    const counter = document.querySelector<HTMLElement>('[data-deck-counter]');
    const progress = document.querySelector<HTMLElement>(
        '[data-deck-progress]',
    );
    const overview = document.querySelector<HTMLElement>(
        '[data-deck-overview]',
    );
    const help = document.querySelector<HTMLElement>('[data-deck-help]');
    const blackout = document.querySelector<HTMLElement>(
        '[data-deck-blackout]',
    );
    const ui = document.querySelector<HTMLElement>('[data-deck-ui]');

    // Níveis de etapa por slide (data-build = 1, 2, 3…).
    const levels = slides.map((slide) =>
        buildLevels(
            [...slide.querySelectorAll<HTMLElement>('[data-build]')].map((el) =>
                Number(el.dataset.build),
            ),
        ),
    );
    const builds = levels.map((l) => l.length);

    let state: DeckState = parseHash(location.hash, builds);
    const channel =
        'BroadcastChannel' in window
            ? new BroadcastChannel(DECK_CHANNEL)
            : null;

    const fit = () => {
        const scale = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
        stage.style.setProperty('--deck-scale', String(scale));
    };

    const applyBuilds = (index: number, build: number) => {
        const slide = slides[index];
        const shown = new Set(levels[index].slice(0, build));
        for (const el of slide.querySelectorAll<HTMLElement>('[data-build]')) {
            el.toggleAttribute(
                'data-built',
                shown.has(Number(el.dataset.build)),
            );
        }
        // Slide do app: a tela do celular acompanha o último recurso revelado.
        const steps = [
            ...slide.querySelectorAll<HTMLElement>('[data-phone-step]'),
        ];
        if (steps.length) {
            const active = Math.max(0, build - 1);
            steps.forEach((s, i) =>
                s.toggleAttribute('data-active', build > 0 && i === active),
            );
            slide
                .querySelectorAll<HTMLElement>('[data-phone-screen]')
                .forEach((s, i) =>
                    s.toggleAttribute(
                        'data-active',
                        i === (build > 0 ? active : 1),
                    ),
                );
        }
    };

    const render = (previous: DeckState | null) => {
        const swap = () => {
            slides.forEach((slide, i) => {
                const active = i === state.slide;
                slide.toggleAttribute('data-active', active);
                slide.toggleAttribute('inert', !active);
                slide.setAttribute('aria-hidden', String(!active));
            });
            applyBuilds(state.slide, state.build);
        };

        const changedSlide = !previous || previous.slide !== state.slide;
        const doc = document as Document & {
            startViewTransition?: (cb: () => void) => unknown;
        };
        if (
            changedSlide &&
            previous &&
            doc.startViewTransition &&
            !reduceMotion()
        ) {
            doc.startViewTransition(swap);
        } else {
            swap();
        }

        const slide = slides[state.slide];
        const total = slides.length;
        const label = slide.dataset.navLabel ?? '';
        const reserve = slide.dataset.deck === 'backup' ? ' · reserva' : '';
        if (counter)
            counter.textContent = `${state.slide + 1} / ${total}${reserve}`;
        if (progress) {
            progress.style.transform = `scaleX(${(state.slide + 1) / total})`;
        }
        if (changedSlide && announcer) {
            const title =
                slide.querySelector('h1, h2')?.textContent?.trim() ?? label;
            announcer.textContent = `Slide ${state.slide + 1} de ${total}: ${title}`;
            track('slide_view', {
                slide: slide.dataset.slide ?? '',
                modo: 'deck',
            });
        }
        history.replaceState(null, '', toHash(state));
        channel?.postMessage({
            type: 'state',
            slide: state.slide,
            build: state.build,
            total,
        } satisfies DeckMessage);
    };

    const go = (next: DeckState) => {
        if (next.slide === state.slide && next.build === state.build) return;
        const previous = state;
        state = next;
        render(previous);
    };

    const next = () => go(nextState(state, builds));
    const prev = () => go(prevState(state, builds));

    // Painéis (visão geral, ajuda, tela preta).
    const toggle = (el: HTMLElement | null, force?: boolean) => {
        if (!el) return false;
        const open = force ?? el.hidden;
        el.hidden = !open;
        return open;
    };
    const anyPanelOpen = () =>
        !(overview?.hidden ?? true) || !(help?.hidden ?? true);

    let typed = '';
    document.addEventListener('keydown', (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const key = event.key;

        if (/^\d$/.test(key)) {
            typed = (typed + key).slice(-3);
            return;
        }
        if (key === 'Enter' && typed) {
            go(gotoSlide(Number(typed) - 1, builds));
            typed = '';
            event.preventDefault();
            return;
        }
        typed = '';

        if (key === 'Escape') {
            if (anyPanelOpen()) {
                toggle(overview, false);
                toggle(help, false);
            } else {
                toggle(overview, true);
            }
            return;
        }
        if (anyPanelOpen() && !['o', 'O', '?'].includes(key)) return;

        switch (key) {
            case 'ArrowRight':
            case 'ArrowDown':
            case 'PageDown':
            case ' ':
            case 'Enter':
            case 'n':
                event.preventDefault();
                next();
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
            case 'PageUp':
            case 'Backspace':
            case 'p':
                event.preventDefault();
                prev();
                break;
            case 'Home':
                go(gotoSlide(0, builds));
                break;
            case 'End':
                go(gotoSlide(slides.length - 1, builds, true));
                break;
            case 'f':
            case 'F':
                if (document.fullscreenElement) {
                    void document.exitFullscreen();
                } else {
                    void document.documentElement.requestFullscreen?.();
                }
                break;
            case 'o':
            case 'O':
                toggle(overview);
                toggle(help, false);
                break;
            case 'b':
            case 'B':
            case '.':
                toggle(blackout);
                break;
            case 's':
            case 'S':
                window.open(
                    '/apresentacao/notas',
                    'vozcidada-notas',
                    'width=1100,height=720',
                );
                break;
            case '?':
                toggle(help);
                toggle(overview, false);
                break;
        }
    });

    // Clique no palco avança (exceto em controles); toque com deslizar.
    stage.addEventListener('click', (event) => {
        if (
            (event.target as Element).closest(
                'a, button, input, select, summary, label',
            )
        )
            return;
        next();
    });
    let touchX = 0;
    stage.addEventListener(
        'touchstart',
        (e) => (touchX = e.touches[0].clientX),
        { passive: true },
    );
    stage.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
    });

    // Botões da barra e da visão geral.
    document.addEventListener('click', (event) => {
        const target = (event.target as Element).closest<HTMLElement>(
            '[data-deck-action], [data-deck-goto]',
        );
        if (!target) return;
        if (target.dataset.deckGoto) {
            go(gotoSlide(Number(target.dataset.deckGoto), builds));
            toggle(overview, false);
            return;
        }
        switch (target.dataset.deckAction) {
            case 'next':
                next();
                break;
            case 'prev':
                prev();
                break;
            case 'overview':
                toggle(overview);
                break;
            case 'help':
                toggle(help);
                break;
            case 'fullscreen':
                if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen?.();
                break;
            case 'notes':
                window.open(
                    '/apresentacao/notas',
                    'vozcidada-notas',
                    'width=1100,height=720',
                );
                break;
            case 'close-panels':
                toggle(overview, false);
                toggle(help, false);
                break;
        }
    });

    // Barra de controles some depois de 2,5 s sem mexer o mouse.
    let hideTimer = 0;
    const wake = () => {
        ui?.removeAttribute('data-idle');
        clearTimeout(hideTimer);
        hideTimer = window.setTimeout(
            () => ui?.setAttribute('data-idle', ''),
            2500,
        );
    };
    document.addEventListener('pointermove', wake);
    wake();

    channel?.addEventListener('message', (event: MessageEvent<DeckMessage>) => {
        const msg = event.data;
        if (msg.type === 'hello') render(null);
        if (msg.type !== 'command') return;
        if (msg.action === 'next') next();
        if (msg.action === 'prev') prev();
        if (msg.action === 'goto' && typeof msg.slide === 'number') {
            go(gotoSlide(msg.slide, builds));
        }
    });

    window.addEventListener('hashchange', () =>
        go(parseHash(location.hash, builds)),
    );
    window.addEventListener('resize', fit);
    fit();
    render(null);
    track('presentation_start', { modo: 'deck' });
}
