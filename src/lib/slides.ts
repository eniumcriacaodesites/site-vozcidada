import { getCollection, type CollectionEntry } from 'astro:content';

export type Slide = CollectionEntry<'slides'>;

/** "05-como-funciona" → "como-funciona" (âncora da seção). */
export function slideAnchor(id: string): string {
    return id.replace(/^\d+-/, '');
}

/** Todos os slides em ordem. */
export async function getSlides(): Promise<Slide[]> {
    const slides = await getCollection('slides');
    return slides.sort((a, b) => a.data.order - b.data.order);
}

/** Ordem do deck: principais primeiro, reservas no fim; "web" fica de fora. */
export function deckOrder(slides: Slide[]): Slide[] {
    const main = slides.filter((s) => s.data.deck === 'main');
    const backup = slides.filter((s) => s.data.deck === 'backup');
    return [...main, ...backup];
}
