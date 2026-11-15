<script setup lang="ts">
/**
 * Formulário "Agendar demonstração" em 2 etapas (ilha Vue, client:visible).
 * Validação compartilhada com o Worker (src/lib/lead/validate.ts), Turnstile
 * carregado só na etapa 2, honeypot e tempo mínimo contra robôs.
 */
import { nextTick, reactive, ref, watch } from 'vue';

import { readOrigin, track } from '@/lib/analytics';
import {
    formatPhone,
    PERIODS,
    ROLES,
    UFS,
    validateStep1,
    validateStep2,
    type LeadErrors,
    type LeadField,
} from '@/lib/lead/validate';

interface TurnstileApi {
    render: (el: HTMLElement, options: Record<string, unknown>) => string;
    reset: (id?: string) => void;
}

const props = defineProps<{
    siteKey: string;
    whatsappHref?: string | null;
    context?: string;
}>();

const step = ref<1 | 2>(1);
const form = reactive({
    uf: '',
    municipio: '',
    municipioIbge: '',
    cargo: '',
    nome: '',
    whatsapp: '',
    email: '',
    periodo: '',
    consentimento: false,
    website: '',
});
const errors = ref<LeadErrors>({});
const status = ref<'idle' | 'sending' | 'error'>('idle');
const statusMessage = ref('');
const municipios = ref<[string, string][]>([]);
const loadingMunicipios = ref(false);
const turnstileToken = ref('');
const turnstileEl = ref<HTMLElement | null>(null);
let widgetId: string | null = null;
let startedAt = 0;

const fieldId = (name: LeadField) => `lead-${name}`;
const errorId = (name: LeadField) => `lead-${name}-erro`;

watch(
    () => form.uf,
    async (uf) => {
        form.municipio = '';
        form.municipioIbge = '';
        municipios.value = [];
        if (!uf) return;
        loadingMunicipios.value = true;
        try {
            const response = await fetch(`/data/ibge/${uf}.json`);
            municipios.value = await response.json();
        } catch {
            municipios.value = [];
        } finally {
            loadingMunicipios.value = false;
        }
    },
);

// Reavalia também quando a lista do IBGE termina de carregar: o nome pode ter
// sido digitado (ou preenchido pelo navegador) antes de a lista chegar.
watch([() => form.municipio, municipios], ([name]) => {
    const hit = municipios.value.find(
        ([, nome]) =>
            nome.localeCompare(name.trim(), 'pt-BR', {
                sensitivity: 'base',
            }) === 0,
    );
    form.municipioIbge = hit ? hit[0] : '';
});

function markStarted(): void {
    if (!startedAt) {
        startedAt = Date.now();
        track('form_start', { origem: props.context ?? 'contato' });
    }
}

function onPhoneInput(event: Event): void {
    form.whatsapp = formatPhone((event.target as HTMLInputElement).value);
}

async function focusFirstError(): Promise<void> {
    await nextTick();
    const first = Object.keys(errors.value)[0] as LeadField | undefined;
    if (first) {
        document.getElementById(fieldId(first))?.focus();
    }
}

async function next(): Promise<void> {
    markStarted();
    errors.value = validateStep1(form);
    if (Object.keys(errors.value).length) {
        await focusFirstError();
        return;
    }
    step.value = 2;
    track('form_step', { etapa: 2 });
    await nextTick();
    document.getElementById(fieldId('nome'))?.focus();
    loadTurnstile();
}

async function back(): Promise<void> {
    step.value = 1;
    await nextTick();
    document.getElementById(fieldId('uf'))?.focus();
}

function loadTurnstile(): void {
    const w = window as unknown as { turnstile?: TurnstileApi };
    const render = () => {
        if (!w.turnstile || !turnstileEl.value || widgetId) return;
        widgetId = w.turnstile.render(turnstileEl.value, {
            sitekey: props.siteKey,
            language: 'pt-br',
            appearance: 'interaction-only',
            callback: (token: string) => {
                turnstileToken.value = token;
            },
            'expired-callback': () => {
                turnstileToken.value = '';
            },
            'error-callback': () => {
                turnstileToken.value = '';
            },
        });
    };
    if (w.turnstile) {
        render();
        return;
    }
    let script = document.querySelector<HTMLScriptElement>(
        'script[data-turnstile]',
    );
    if (!script) {
        script = document.createElement('script');
        script.src =
            'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.dataset.turnstile = '';
        document.head.appendChild(script);
    }
    script.addEventListener('load', render, { once: true });
}

function resetTurnstile(): void {
    const w = window as unknown as { turnstile?: TurnstileApi };
    turnstileToken.value = '';
    if (widgetId && w.turnstile) {
        w.turnstile.reset(widgetId);
    }
}

async function waitForToken(ms = 6000): Promise<string> {
    const start = Date.now();
    while (!turnstileToken.value && Date.now() - start < ms) {
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return turnstileToken.value;
}

async function submit(): Promise<void> {
    markStarted();
    errors.value = validateStep2(form);
    if (Object.keys(errors.value).length) {
        await focusFirstError();
        return;
    }
    status.value = 'sending';
    statusMessage.value = 'Enviando…';

    const token = await waitForToken();
    if (!token) {
        status.value = 'error';
        statusMessage.value =
            'Não conseguimos confirmar que você não é um robô. Tente novamente em alguns segundos.';
        return;
    }

    try {
        const response = await fetch('/api/lead', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                ...form,
                turnstileToken: token,
                t: Date.now() - startedAt,
                origem: {
                    ...readOrigin(),
                    slide: props.context ?? 'contato',
                    modo: 'web',
                },
            }),
        });
        const body = (await response.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            fields?: LeadErrors;
        };
        if (response.ok && body.ok) {
            track('form_submit', { cargo: form.cargo, uf: form.uf });
            window.location.href = '/obrigado';
            return;
        }
        if (response.status === 422 && body.fields) {
            errors.value = body.fields;
            if (Object.keys(validateStep1(form)).length) {
                step.value = 1;
            }
            status.value = 'idle';
            statusMessage.value = '';
            await focusFirstError();
            resetTurnstile();
            return;
        }
        throw new Error(body.error ?? `http_${response.status}`);
    } catch (error) {
        status.value = 'error';
        statusMessage.value =
            'Não conseguimos enviar agora. Tente de novo em instantes ou fale conosco pelo WhatsApp.';
        track('form_error', { motivo: String((error as Error).message) });
        resetTurnstile();
    }
}

const inputClass =
    'h-12 w-full rounded-xl border border-line bg-white px-4 text-[1rem] text-text placeholder:text-subtle transition-shadow focus:border-navy-700 focus:ring-4 focus:ring-navy-700/15 focus:outline-none aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15 disabled:bg-paper disabled:text-subtle';
</script>

<template>
    <form
        class="flex flex-col gap-6 rounded-[1.375rem] bg-white p-6 text-text shadow-lift ring-1 ring-black/5 sm:p-8"
        method="post"
        action="/api/lead"
        novalidate
        aria-labelledby="lead-titulo"
        @submit.prevent="step === 1 ? next() : submit()"
        @focusin="markStarted"
    >
        <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between gap-4">
                <h3 id="lead-titulo" class="text-[1.3rem] font-extrabold">
                    Agendar demonstração
                </h3>
                <span
                    class="shrink-0 text-sm font-semibold whitespace-nowrap text-muted"
                    aria-live="polite"
                    >Etapa {{ step }} de 2</span
                >
            </div>
            <div
                class="h-1.5 overflow-hidden rounded-full bg-paper"
                aria-hidden="true"
            >
                <div
                    class="h-full rounded-full bg-orange-500 transition-[width] duration-500"
                    :style="{ width: step === 1 ? '50%' : '100%' }"
                ></div>
            </div>
        </div>

        <fieldset v-show="step === 1" class="flex flex-col gap-4">
            <legend class="mb-1 font-bold">Sua prefeitura</legend>
            <div class="grid gap-4 sm:grid-cols-[7.5rem_1fr]">
                <div class="flex flex-col gap-1.5">
                    <label :for="fieldId('uf')" class="text-sm font-semibold"
                        >Estado</label
                    >
                    <select
                        :id="fieldId('uf')"
                        v-model="form.uf"
                        name="uf"
                        :class="inputClass"
                        autocomplete="address-level1"
                        :aria-invalid="Boolean(errors.uf)"
                        :aria-describedby="
                            errors.uf ? errorId('uf') : undefined
                        "
                    >
                        <option value="" disabled>UF</option>
                        <option v-for="uf in UFS" :key="uf" :value="uf">
                            {{ uf }}
                        </option>
                    </select>
                    <p
                        v-if="errors.uf"
                        :id="errorId('uf')"
                        class="text-sm text-danger"
                    >
                        {{ errors.uf }}
                    </p>
                </div>
                <div class="flex flex-col gap-1.5">
                    <label
                        :for="fieldId('municipio')"
                        class="text-sm font-semibold"
                        >Município</label
                    >
                    <input
                        :id="fieldId('municipio')"
                        v-model="form.municipio"
                        name="municipio"
                        type="text"
                        list="lead-municipios"
                        :class="inputClass"
                        :disabled="!form.uf"
                        :placeholder="
                            form.uf
                                ? loadingMunicipios
                                    ? 'Carregando…'
                                    : 'Digite o nome'
                                : 'Escolha o estado primeiro'
                        "
                        autocomplete="address-level2"
                        :aria-invalid="Boolean(errors.municipio)"
                        :aria-describedby="
                            errors.municipio ? errorId('municipio') : undefined
                        "
                    />
                    <input
                        type="hidden"
                        name="municipioIbge"
                        :value="form.municipioIbge"
                    />
                    <datalist id="lead-municipios">
                        <option
                            v-for="[id, nome] in municipios"
                            :key="id"
                            :value="nome"
                        ></option>
                    </datalist>
                    <p
                        v-if="errors.municipio"
                        :id="errorId('municipio')"
                        class="text-sm text-danger"
                    >
                        {{ errors.municipio }}
                    </p>
                </div>
            </div>
            <div class="flex flex-col gap-1.5">
                <label :for="fieldId('cargo')" class="text-sm font-semibold"
                    >Seu cargo ou área</label
                >
                <select
                    :id="fieldId('cargo')"
                    v-model="form.cargo"
                    name="cargo"
                    :class="inputClass"
                    :aria-invalid="Boolean(errors.cargo)"
                    :aria-describedby="
                        errors.cargo ? errorId('cargo') : undefined
                    "
                >
                    <option value="" disabled>Selecione</option>
                    <option v-for="role in ROLES" :key="role" :value="role">
                        {{ role }}
                    </option>
                </select>
                <p
                    v-if="errors.cargo"
                    :id="errorId('cargo')"
                    class="text-sm text-danger"
                >
                    {{ errors.cargo }}
                </p>
            </div>
            <button
                type="submit"
                class="mt-2 inline-flex h-13 items-center justify-center gap-2 rounded-full bg-orange-500 px-7 font-bold text-navy-950 shadow-[0_12px_30px_-12px_rgb(240_125_63/0.75)] transition-colors hover:bg-orange-300"
            >
                Continuar
                <span aria-hidden="true">→</span>
            </button>
        </fieldset>

        <fieldset v-show="step === 2" class="flex flex-col gap-4">
            <legend class="mb-1 font-bold">Seu contato</legend>
            <div class="flex flex-col gap-1.5">
                <label :for="fieldId('nome')" class="text-sm font-semibold"
                    >Nome</label
                >
                <input
                    :id="fieldId('nome')"
                    v-model="form.nome"
                    name="nome"
                    type="text"
                    :class="inputClass"
                    autocomplete="name"
                    :aria-invalid="Boolean(errors.nome)"
                    :aria-describedby="
                        errors.nome ? errorId('nome') : undefined
                    "
                />
                <p
                    v-if="errors.nome"
                    :id="errorId('nome')"
                    class="text-sm text-danger"
                >
                    {{ errors.nome }}
                </p>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                    <label
                        :for="fieldId('whatsapp')"
                        class="text-sm font-semibold"
                        >WhatsApp</label
                    >
                    <input
                        :id="fieldId('whatsapp')"
                        :value="form.whatsapp"
                        name="whatsapp"
                        type="tel"
                        inputmode="tel"
                        placeholder="(79) 99999-9999"
                        :class="inputClass"
                        autocomplete="tel-national"
                        :aria-invalid="Boolean(errors.whatsapp)"
                        :aria-describedby="
                            errors.whatsapp ? errorId('whatsapp') : undefined
                        "
                        @input="onPhoneInput"
                    />
                    <p
                        v-if="errors.whatsapp"
                        :id="errorId('whatsapp')"
                        class="text-sm text-danger"
                    >
                        {{ errors.whatsapp }}
                    </p>
                </div>
                <div class="flex flex-col gap-1.5">
                    <label :for="fieldId('email')" class="text-sm font-semibold"
                        >E-mail</label
                    >
                    <input
                        :id="fieldId('email')"
                        v-model="form.email"
                        name="email"
                        type="email"
                        inputmode="email"
                        :class="inputClass"
                        autocomplete="email"
                        :aria-invalid="Boolean(errors.email)"
                        :aria-describedby="
                            errors.email ? errorId('email') : undefined
                        "
                    />
                    <p
                        v-if="errors.email"
                        :id="errorId('email')"
                        class="text-sm text-danger"
                    >
                        {{ errors.email }}
                    </p>
                </div>
            </div>
            <div
                class="flex flex-col gap-2"
                role="radiogroup"
                aria-labelledby="lead-periodo-rotulo"
                :aria-describedby="
                    errors.periodo ? errorId('periodo') : undefined
                "
            >
                <span id="lead-periodo-rotulo" class="text-sm font-semibold"
                    >Melhor período para contato</span
                >
                <div class="flex flex-wrap gap-2">
                    <label
                        v-for="(period, index) in PERIODS"
                        :key="period"
                        class="relative inline-flex h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm font-semibold transition-colors has-[:checked]:border-navy-900 has-[:checked]:bg-navy-900 has-[:checked]:text-white has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-navy-700/25"
                    >
                        <input
                            :id="index === 0 ? fieldId('periodo') : undefined"
                            v-model="form.periodo"
                            class="sr-only"
                            type="radio"
                            name="periodo"
                            :value="period"
                        />
                        {{ period }}
                    </label>
                </div>
                <p
                    v-if="errors.periodo"
                    :id="errorId('periodo')"
                    class="text-sm text-danger"
                >
                    {{ errors.periodo }}
                </p>
            </div>
            <div class="flex flex-col gap-1.5">
                <label class="flex items-start gap-3 text-sm text-muted">
                    <input
                        :id="fieldId('consentimento')"
                        v-model="form.consentimento"
                        name="consentimento"
                        type="checkbox"
                        class="mt-0.5 size-5 shrink-0 accent-navy-900"
                        :aria-invalid="Boolean(errors.consentimento)"
                        :aria-describedby="
                            errors.consentimento
                                ? errorId('consentimento')
                                : undefined
                        "
                    />
                    <span>
                        Autorizo o contato da equipe do VozCidadã sobre a
                        demonstração, conforme a
                        <a
                            href="/privacidade"
                            class="font-semibold text-orange-700 underline underline-offset-2"
                            target="_blank"
                            >política de privacidade</a
                        >.
                    </span>
                </label>
                <p
                    v-if="errors.consentimento"
                    :id="errorId('consentimento')"
                    class="text-sm text-danger"
                >
                    {{ errors.consentimento }}
                </p>
            </div>

            <div class="absolute -left-[9999px]" aria-hidden="true">
                <label for="lead-website">Não preencha este campo</label>
                <input
                    id="lead-website"
                    v-model="form.website"
                    name="website"
                    type="text"
                    tabindex="-1"
                    autocomplete="off"
                />
            </div>
            <div ref="turnstileEl" class="min-h-0"></div>

            <div
                class="flex flex-col-reverse gap-3 sm:flex-row sm:items-center"
            >
                <button
                    type="button"
                    class="h-12 rounded-full px-5 font-semibold text-muted transition-colors hover:text-text"
                    @click="back"
                >
                    ← Voltar
                </button>
                <button
                    type="submit"
                    class="inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-full bg-orange-500 px-7 font-bold text-navy-950 shadow-[0_12px_30px_-12px_rgb(240_125_63/0.75)] transition-colors hover:bg-orange-300 disabled:opacity-60"
                    :disabled="status === 'sending'"
                >
                    {{
                        status === 'sending'
                            ? 'Enviando…'
                            : 'Agendar minha demonstração'
                    }}
                </button>
            </div>
        </fieldset>

        <p
            class="text-sm"
            :class="status === 'error' ? 'text-danger' : 'text-muted'"
            role="status"
            aria-live="polite"
        >
            {{ statusMessage }}
            <a
                v-if="status === 'error' && whatsappHref"
                :href="whatsappHref"
                class="font-semibold text-orange-700 underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
                >Falar pelo WhatsApp</a
            >
        </p>
        <p class="text-xs text-muted">
            Sem compromisso · resposta pelo WhatsApp informado.
        </p>
    </form>
</template>
