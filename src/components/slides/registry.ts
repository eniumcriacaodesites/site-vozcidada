import AiSlide from './AiSlide.astro';
import CaseStudy from './CaseStudy.astro';
import CitizenApp from './CitizenApp.astro';
import Contact from './Contact.astro';
import Cost from './Cost.astro';
import Faq from './Faq.astro';
import Field from './Field.astro';
import Hero from './Hero.astro';
import HowItWorks from './HowItWorks.astro';
import ManagerPanel from './ManagerPanel.astro';
import Personas from './Personas.astro';
import Problem from './Problem.astro';
import Rollout from './Rollout.astro';
import Security from './Security.astro';
import Solution from './Solution.astro';
import Transparency from './Transparency.astro';
import Triage from './Triage.astro';

/** Âncora do slide (nome do arquivo sem o número) → componente de layout. */
export const slideComponents = {
    inicio: Hero,
    problema: Problem,
    custo: Cost,
    solucao: Solution,
    'como-funciona': HowItWorks,
    app: CitizenApp,
    ia: AiSlide,
    triagem: Triage,
    campo: Field,
    painel: ManagerPanel,
    transparencia: Transparency,
    'para-quem': Personas,
    seguranca: Security,
    case: CaseStudy,
    implantacao: Rollout,
    perguntas: Faq,
    contato: Contact,
} as const;

export type SlideAnchor = keyof typeof slideComponents;

export function componentFor(anchor: string) {
    return anchor in slideComponents
        ? slideComponents[anchor as SlideAnchor]
        : null;
}
