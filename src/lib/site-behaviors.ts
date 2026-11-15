/**
 * Comportamentos da landing que NÃO dependem do GSAP (rodam sempre, mesmo
 * com movimento reduzido): cabeçalho, menu, "Pausar animações", slide atual,
 * teclado entre slides, WhatsApp contextual, telas do celular e progresso.
 */
import { bindTrackedClicks, captureOrigin, track } from './analytics';

const MOTION_KEY = 'vc:motion';
const root = document.documentElement;

export function motionAllowed(): boolean {
    return (
        root.dataset.motion !== 'off' &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches
    );
}

function initMotionToggle(): void {
    const toggles = document.querySelectorAll<HTMLButtonElement>(
        '[data-motion-toggle]',
    );
    const sync = () => {
        const paused = root.dataset.motion === 'off';
        for (const toggle of toggles) {
            toggle.setAttribute('aria-pressed', String(paused));
            const label = paused ? 'Retomar animações' : 'Pausar animações';
            if (toggle.hasAttribute('aria-label')) {
                toggle.setAttribute('aria-label', label);
                toggle.title = label;
            }
        }
    };
    for (const toggle of toggles) {
        toggle.addEventListener('click', () => {
            const paused = root.dataset.motion !== 'off';
            if (paused) {
                root.dataset.motion = 'off';
            } else {
                delete root.dataset.motion;
            }
            try {
                localStorage.setItem(MOTION_KEY, paused ? 'off' : 'on');
            } catch {
                /* sem armazenamento */
            }
            sync();
            window.dispatchEvent(new CustomEvent('vc:motion-change'));
        });
    }
    sync();
}

function initHeader(): void {
    const header = document.querySelector<HTMLElement>('[data-header]');
    const button =
        document.querySelector<HTMLButtonElement>('[data-menu-button]');
    const menu = document.querySelector<HTMLElement>('[data-menu]');
    if (!header) return;

    const onScroll = () => {
        header.toggleAttribute('data-scrolled', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    if (!button || !menu) return;
    const setOpen = (open: boolean) => {
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
        menu.toggleAttribute('data-open', open);
        header.toggleAttribute('data-scrolled', open || window.scrollY > 24);
    };
    button.addEventListener('click', () =>
        setOpen(button.getAttribute('aria-expanded') !== 'true'),
    );
    for (const link of menu.querySelectorAll('[data-menu-link]')) {
        link.addEventListener('click', () => setOpen(false));
    }
    document.addEventListener('keydown', (event) => {
        if (
            event.key === 'Escape' &&
            button.getAttribute('aria-expanded') === 'true'
        ) {
            setOpen(false);
            button.focus();
        }
    });
}

function slides(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('main [data-slide]')];
}

function initSlideTracking(): void {
    const list = slides();
    const dots = document.querySelector<HTMLElement>('[data-dot-nav]');
    const counter = document.querySelector<HTMLElement>('[data-dot-current]');
    const whatsapp = document.querySelector<HTMLAnchorElement>(
        '[data-whatsapp-float]',
    );
    const seen = new Set<string>();

    const activate = (section: HTMLElement) => {
        const anchor = section.dataset.slide ?? '';
        const label = section.dataset.navLabel ?? anchor;
        const order = String(list.indexOf(section) + 1).padStart(2, '0');

        if (dots) {
            dots.dataset.on =
                section.dataset.theme === 'light' ? 'light' : 'dark';
            for (const dot of dots.querySelectorAll<HTMLElement>(
                '[data-dot]',
            )) {
                if (dot.dataset.dot === anchor) {
                    dot.setAttribute('aria-current', 'true');
                } else {
                    dot.removeAttribute('aria-current');
                }
            }
        }
        if (counter) counter.textContent = order;

        if (whatsapp?.dataset.number) {
            const text = `Olá! Estou vendo o site do VozCidadã (seção: ${label}) e quero agendar uma demonstração.`;
            whatsapp.href = `https://wa.me/${whatsapp.dataset.number}?text=${encodeURIComponent(text)}`;
            const hide = anchor === 'inicio' || anchor === 'contato';
            whatsapp.toggleAttribute('data-visible', !hide);
        }
        if (!seen.has(anchor)) {
            seen.add(anchor);
            track('slide_view', { slide: anchor, ordem: order });
        }
    };

    const io = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    activate(entry.target as HTMLElement);
                }
            }
        },
        { rootMargin: '-50% 0px -50% 0px' },
    );
    for (const section of list) io.observe(section);
}

/** PgDn/PgUp/Espaço pulam para o início do próximo/anterior slide. */
function initSlideKeys(): void {
    document.addEventListener('keydown', (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const target = event.target as HTMLElement | null;
        if (
            target?.closest(
                'input, textarea, select, button, a, summary, [contenteditable], [role="radiogroup"]',
            )
        ) {
            return;
        }
        const forward =
            event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey);
        const backward =
            event.key === 'PageUp' || (event.key === ' ' && event.shiftKey);
        if (!forward && !backward) return;

        const list = slides();
        const y = window.scrollY + 2;
        const tops = list.map(
            (s) => s.getBoundingClientRect().top + window.scrollY,
        );
        let index = tops.findIndex(
            (top, i) => y >= top && (i === tops.length - 1 || y < tops[i + 1]),
        );
        if (index < 0) index = 0;
        const next = forward
            ? index + 1
            : y - tops[index] > 40
              ? index
              : index - 1;
        const destination = list[next];
        if (!destination) return;

        event.preventDefault();
        destination.scrollIntoView({
            behavior: motionAllowed() ? 'smooth' : 'auto',
            block: 'start',
        });
    });
}

/** S06: destaca o recurso visível e troca a tela do celular. */
function initPhoneSteps(): void {
    const steps = [
        ...document.querySelectorAll<HTMLElement>('[data-phone-step]'),
    ];
    const screens = [
        ...document.querySelectorAll<HTMLElement>('[data-phone-screen]'),
    ];
    if (!steps.length || !screens.length) return;

    const show = (index: number) => {
        steps.forEach((step, i) =>
            step.toggleAttribute('data-active', i === index),
        );
        screens.forEach((screen, i) =>
            screen.toggleAttribute('data-active', i === index),
        );
    };
    const io = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    show(
                        Number((entry.target as HTMLElement).dataset.phoneStep),
                    );
                }
            }
        },
        { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const step of steps) {
        io.observe(step);
        step.addEventListener('click', () =>
            show(Number(step.dataset.phoneStep)),
        );
    }
}

/** Fallback da barra de progresso onde não há scroll-driven animations. */
function initProgressFallback(): void {
    if (CSS.supports('animation-timeline: scroll()')) return;
    const bar = document.querySelector<HTMLElement>('[data-scroll-progress]');
    if (!bar) return;
    let ticking = false;
    const update = () => {
        const max = document.documentElement.scrollHeight - innerHeight;
        bar.style.setProperty(
            '--progress',
            String(max > 0 ? scrollY / max : 0),
        );
        ticking = false;
    };
    window.addEventListener(
        'scroll',
        () => {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(update);
            }
        },
        { passive: true },
    );
    update();
}

export function initSiteBehaviors(): void {
    captureOrigin();
    bindTrackedClicks();
    initMotionToggle();
    initHeader();
    initSlideTracking();
    initSlideKeys();
    initPhoneSteps();
    initProgressFallback();
}
