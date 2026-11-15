/**
 * Camada de movimento da landing (GSAP + Lenis). Carregada sob demanda e
 * SÓ quando há movimento permitido; `destroyMotion()` reverte tudo (botão
 * "Pausar animações" ou preferência do sistema).
 *
 * Princípios: melhoria progressiva (o conteúdo já está visível sem JS),
 * só transform/opacity, efeitos completos no desktop e simplificados no
 * celular (gsap.matchMedia).
 */
import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin);

let ctx: gsap.Context | null = null;
let lenis: Lenis | null = null;
const cleanups: (() => void)[] = [];

const raf = (time: number) => lenis?.raf(time * 1000);
const q = <T extends Element = HTMLElement>(
    sel: string,
    scope: Element | Document = document,
) => [...scope.querySelectorAll<T>(sel)];
const finePointer = () =>
    matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Revelação genérica (fade + subida) dos elementos com data-reveal. */
function reveals(): void {
    const items = q('[data-reveal]').filter(
        (el) => !el.closest('[data-scene="hero"]'),
    );
    const below = items.filter(
        (el) => el.getBoundingClientRect().top > window.innerHeight * 0.92,
    );
    gsap.set(below, { autoAlpha: 0, y: 28 });
    ScrollTrigger.batch(below, {
        start: 'top 90%',
        once: true,
        onEnter: (batch) =>
            gsap.to(batch, {
                autoAlpha: 1,
                y: 0,
                duration: 0.9,
                ease: 'expo.out',
                stagger: 0.07,
                overwrite: true,
            }),
    });
}

/** Títulos revelados linha a linha (SplitText com máscara). */
function splitHeadings(): void {
    for (const el of q('[data-split]')) {
        if (el.closest('[data-scene="hero"]')) continue;
        if (el.getBoundingClientRect().top < window.innerHeight * 0.9) continue;
        SplitText.create(el, {
            type: 'lines',
            mask: 'lines',
            autoSplit: true,
            onSplit: (self) =>
                gsap.from(self.lines, {
                    yPercent: 110,
                    duration: 1.05,
                    ease: 'expo.out',
                    stagger: 0.09,
                    scrollTrigger: {
                        trigger: el,
                        start: 'top 88%',
                        once: true,
                    },
                }),
        });
    }
}

/** S01: parallax da cidade por rolagem + parallax pelo ponteiro. */
function hero(): void {
    const section = document.querySelector<HTMLElement>('[data-scene="hero"]');
    if (!section) return;
    const height = () => section.offsetHeight;

    for (const layer of q(
        '[data-city] [data-depth], :scope > [data-depth]',
        section,
    )) {
        const depth = Number(layer.dataset.depth ?? 0.2);
        gsap.to(layer, {
            y: () => (1 - depth) * height() * 0.32,
            ease: 'none',
            scrollTrigger: {
                trigger: section,
                start: 'top top',
                end: 'bottom top',
                scrub: true,
                invalidateOnRefresh: true,
            },
        });
    }

    const phone = section.querySelector<HTMLElement>('[data-hero-phone]');
    if (phone) {
        gsap.to(phone, {
            yPercent: -12,
            ease: 'none',
            scrollTrigger: {
                trigger: section,
                start: 'top top',
                end: 'bottom top',
                scrub: true,
            },
        });
    }

    if (!finePointer()) return;
    const movers = q('[data-chip], [data-hero-phone] > figure', section).map(
        (el) => ({
            depth: Number(el.dataset.depth ?? 0.08),
            x: gsap.quickTo(el, 'x', { duration: 0.8, ease: 'power3.out' }),
            y: gsap.quickTo(el, 'y', { duration: 0.8, ease: 'power3.out' }),
        }),
    );
    const onMove = (event: PointerEvent) => {
        const rect = section.getBoundingClientRect();
        const mx = (event.clientX - rect.left) / rect.width - 0.5;
        const my = (event.clientY - rect.top) / rect.height - 0.5;
        for (const mover of movers) {
            mover.x(mx * mover.depth * 160);
            mover.y(my * mover.depth * 100);
        }
    };
    section.addEventListener('pointermove', onMove);
    cleanups.push(() => section.removeEventListener('pointermove', onMove));
}

/** S02: cartões do "caos" à deriva (só no layout largo). */
function chaos(mm: gsap.MatchMedia): void {
    const section = document.querySelector<HTMLElement>('[data-scene="chaos"]');
    if (!section) return;
    mm.add('(min-width: 1024px)', () => {
        for (const card of q('[data-chaos-card]', section)) {
            gsap.fromTo(
                card,
                {
                    y: gsap.utils.random(40, 120),
                    rotation: gsap.utils.random(-14, 14),
                },
                {
                    y: gsap.utils.random(-90, -20),
                    rotation: gsap.utils.random(-8, 8),
                    ease: 'none',
                    scrollTrigger: {
                        trigger: section,
                        start: 'top bottom',
                        end: 'bottom top',
                        scrub: 1,
                    },
                },
            );
        }
    });
}

/** S04: amanhecer + "caos → ordem" + fio da voz. */
function order(): void {
    const section = document.querySelector<HTMLElement>('[data-scene="order"]');
    if (!section) return;

    const dawn = section.querySelector('[data-dawn]');
    if (dawn) {
        gsap.fromTo(
            dawn,
            { opacity: 1 },
            {
                opacity: 0,
                ease: 'none',
                scrollTrigger: {
                    trigger: section,
                    start: 'top bottom',
                    end: 'top 15%',
                    scrub: true,
                },
            },
        );
    }

    const thread = section.querySelector('[data-thread]');
    if (thread) {
        gsap.from(thread, {
            drawSVG: '0%',
            ease: 'none',
            scrollTrigger: {
                trigger: thread,
                start: 'top 85%',
                end: 'top 40%',
                scrub: true,
            },
        });
    }

    const rows = q('[data-protocol]', section);
    if (rows.length) {
        gsap.from(rows, {
            x: () => gsap.utils.random(-260, 260),
            y: () => gsap.utils.random(-160, 60),
            rotation: () => gsap.utils.random(-16, 16),
            opacity: 0,
            ease: 'power3.out',
            stagger: 0.06,
            scrollTrigger: {
                trigger: rows[0].parentElement,
                start: 'top 90%',
                end: 'top 40%',
                scrub: 1,
            },
        });
    }
}

/** S05: slide fixado revelando os 4 passos com a linha de progresso. */
function journey(mm: gsap.MatchMedia): void {
    const section = document.querySelector<HTMLElement>(
        '[data-scene="journey"]',
    );
    if (!section) return;
    mm.add('(min-width: 1280px) and (min-height: 700px)', () => {
        const steps = q('[data-journey-step]', section);
        steps.forEach((step) => step.removeAttribute('data-reveal'));
        const progress = section.querySelector('[data-journey-progress]');
        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: section,
                pin: true,
                start: 'top top',
                end: '+=110%',
                scrub: 0.8,
            },
        });
        if (progress) {
            tl.fromTo(
                progress,
                { scaleX: 0 },
                { scaleX: 1, ease: 'none', duration: steps.length },
                0,
            );
        }
        steps.forEach((step, index) => {
            tl.fromTo(
                step,
                { autoAlpha: 0.2, y: 50 },
                { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' },
                index * 0.9,
            );
        });
    });
}

/** S06: mensagens do chat surgindo quando a tela do chat fica ativa. */
function phoneChat(): void {
    const chatScreen = document.querySelector<HTMLElement>(
        '[data-phone-screen="1"]',
    );
    if (!chatScreen) return;
    const play = () => {
        const msgs = q('[data-msg]', chatScreen);
        gsap.fromTo(
            msgs,
            { autoAlpha: 0, y: 12, scale: 0.96 },
            {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                duration: 0.45,
                ease: 'back.out(1.6)',
                stagger: 0.35,
                overwrite: true,
            },
        );
    };
    const observer = new MutationObserver(() => {
        if (chatScreen.hasAttribute('data-active')) play();
    });
    observer.observe(chatScreen, {
        attributes: true,
        attributeFilter: ['data-active'],
    });
    cleanups.push(() => observer.disconnect());
}

/** S07: varredura da IA sobre a foto, selos em sequência e o clique humano. */
function aiScan(): void {
    const card = document.querySelector<HTMLElement>('[data-triage]');
    if (!card) return;
    const scan = card.querySelector('[data-scanline]');
    const badges = q('[data-badge]', card);
    const score = card.querySelector<HTMLElement>('[data-score]');
    const bar = card.querySelector('[data-score-bar]');
    const approve = card.querySelector('[data-approve]');
    const counter = { value: 0 };

    const tl = gsap.timeline({
        scrollTrigger: { trigger: card, start: 'top 72%', once: true },
    });
    if (scan) {
        tl.fromTo(
            scan,
            { yPercent: -100 },
            { yPercent: 330, duration: 1.1, ease: 'power1.inOut', repeat: 1 },
        );
    }
    tl.from(
        badges,
        {
            autoAlpha: 0,
            scale: 0.85,
            y: 8,
            duration: 0.4,
            ease: 'back.out(1.8)',
            stagger: 0.12,
        },
        '-=0.6',
    );
    if (score) {
        tl.to(
            counter,
            {
                value: 87,
                duration: 1,
                ease: 'power2.out',
                onUpdate: () => {
                    score.textContent = String(Math.round(counter.value));
                },
            },
            '<',
        );
    }
    if (bar)
        tl.from(
            bar,
            {
                scaleX: 0,
                transformOrigin: 'left',
                duration: 1,
                ease: 'power2.out',
            },
            '<',
        );
    if (approve)
        tl.to(approve, {
            scale: 1.06,
            duration: 0.25,
            yoyo: true,
            repeat: 3,
            ease: 'power1.inOut',
        });
}

/** S08: holofote passando pela fila, mapa e detalhe. */
function spotlight(mm: gsap.MatchMedia): void {
    const section = document.querySelector<HTMLElement>(
        '[data-scene="spotlight"]',
    );
    if (!section) return;
    mm.add('(min-width: 1024px)', () => {
        const spots = q('[data-spot]', section);
        if (spots.length < 2) return;
        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: spots[0],
                start: 'top 75%',
                end: 'bottom 30%',
                scrub: 1,
            },
        });
        spots.forEach((spot, index) => {
            tl.to(
                spots.filter((s) => s !== spot),
                { opacity: 0.35, duration: 1 },
                index,
            ).to(spot, { opacity: 1, duration: 1 }, index);
        });
        tl.to(spots, { opacity: 1, duration: 1 });
    });
}

function countUp(el: HTMLElement): void {
    const target = Number((el.dataset.countTo ?? '').replace(/\D/g, ''));
    if (!Number.isFinite(target) || target <= 0) return;
    const state = { value: 0 };
    gsap.to(state, {
        value: target,
        duration: 1.6,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        onUpdate: () => {
            el.textContent = Math.round(state.value).toLocaleString('pt-BR');
        },
    });
}

/** S10/S14: contadores, barras, mapa de calor e pinos. */
function dataViz(): void {
    q('[data-count-to]').forEach(countUp);

    for (const bars of q('[data-scene="dashboard"]')) {
        gsap.from(q('[data-bar]', bars), {
            scaleX: 0,
            duration: 1.1,
            ease: 'expo.out',
            stagger: 0.1,
            scrollTrigger: { trigger: bars, start: 'top 70%', once: true },
        });
    }
    for (const map of q<SVGSVGElement>('[data-heatmap]')) {
        const heat = map.querySelector('[data-heat]');
        const pins = q<SVGGElement>('[data-map-pin]', map);
        const tl = gsap.timeline({
            scrollTrigger: { trigger: map, start: 'top 80%', once: true },
        });
        if (heat)
            tl.from(heat, {
                opacity: 0,
                scale: 0.6,
                transformOrigin: '50% 50%',
                duration: 1.2,
                ease: 'power2.out',
            });
        tl.from(
            pins,
            {
                y: -24,
                opacity: 0,
                duration: 0.5,
                ease: 'bounce.out',
                stagger: 0.07,
            },
            '<0.2',
        );
        const polygon = map.querySelector('[data-polygon]');
        if (polygon)
            tl.from(
                polygon,
                { drawSVG: '0%', duration: 1.2, ease: 'power2.inOut' },
                '<',
            );
    }
}

/** S15: linha do tempo preenchendo com a rolagem. */
function timeline(mm: gsap.MatchMedia): void {
    const section = document.querySelector<HTMLElement>(
        '[data-scene="timeline"]',
    );
    const progress = section?.querySelector('[data-timeline-progress]');
    if (!section || !progress) return;
    mm.add(
        { wide: '(min-width: 1024px)', narrow: '(max-width: 1023px)' },
        (context) => {
            const wide = context.conditions?.wide;
            gsap.fromTo(
                progress,
                wide ? { scaleX: 0, scaleY: 1 } : { scaleY: 0, scaleX: 1 },
                {
                    scaleX: 1,
                    scaleY: 1,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: section,
                        start: 'top 70%',
                        end: 'bottom 70%',
                        scrub: true,
                    },
                },
            );
        },
    );
}

/** CTA magnético e holofote nos cartões (só mouse/trackpad). */
function pointerFx(): void {
    if (!finePointer()) return;
    for (const el of q('[data-magnetic]')) {
        const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
        const y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
        const move = (event: PointerEvent) => {
            const rect = el.getBoundingClientRect();
            x((event.clientX - rect.left - rect.width / 2) * 0.25);
            y((event.clientY - rect.top - rect.height / 2) * 0.35);
        };
        const leave = () => {
            x(0);
            y(0);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerleave', leave);
        cleanups.push(() => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerleave', leave);
        });
    }
    const onMove = (event: PointerEvent) => {
        const card = (event.target as Element | null)?.closest<HTMLElement>(
            '[data-spotlight]',
        );
        if (!card) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        card.style.setProperty('--my', `${event.clientY - rect.top}px`);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    cleanups.push(() => document.removeEventListener('pointermove', onMove));
}

export function initMotion(): void {
    if (ctx) return;

    lenis = new Lenis({ lerp: 0.12, anchors: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    ctx = gsap.context(() => {
        const mm = gsap.matchMedia();
        hero();
        chaos(mm);
        order();
        journey(mm);
        phoneChat();
        aiScan();
        spotlight(mm);
        dataViz();
        timeline(mm);
        splitHeadings();
        reveals();
        pointerFx();
    });

    document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

export function destroyMotion(): void {
    for (const cleanup of cleanups.splice(0)) cleanup();
    ctx?.revert();
    ctx = null;
    gsap.ticker.remove(raf);
    lenis?.destroy();
    lenis = null;
    ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
}
