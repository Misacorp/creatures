/**
 * The player-facing glossary (popover text for every tag in the Activity) and the "How to play"
 * page text. Both are data (`data/glossary.json`, `data/how-to-play.json`); this file holds the
 * strict schemas and the load-time checks. None of it has any gameplay effect: the engine never
 * reads it, and the client renders every string as text only.
 */
import * as v from 'valibot';
import { IdSchema, type ContentPack } from './schema';

/** The sections of the How to play page, in the order the page shows them. */
export const GLOSSARY_SECTIONS = [
  'first-week',
  'creatures',
  'combos',
  'raid-week',
  'finale',
  'expeditions',
  'ranks',
  'rewards',
  'workshop',
] as const;
export const GlossarySectionSchema = v.picklist(GLOSSARY_SECTIONS);
export type GlossarySection = v.InferOutput<typeof GlossarySectionSchema>;

export const MAX_GLOSSARY_TITLE = 32;
export const MAX_GLOSSARY_SHORT = 80;
export const MAX_GLOSSARY_LINES = 4;
export const MAX_GLOSSARY_LINE = 120;

/** Player-facing text: no control, format (bidi, zero-width) or line-break characters. */
const PLAIN_TEXT = /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]*$/u;

const Text = (max: number) =>
  v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(max),
    v.regex(PLAIN_TEXT, 'must be plain text without control or format characters'),
  );

/**
 * A small picture for a popover, drawn by the client from sprites it already has: an element icon,
 * the boss's mark in an element's colour, a real species' sprite, a bundled glyph, or a reaction
 * (mark, arrow, element that cashes it in). The id is checked against the content at load time.
 */
export const GlossaryVisualSchema = v.strictObject({
  kind: v.picklist(['element', 'mark', 'species', 'glyph', 'reaction']),
  id: v.pipe(v.string(), v.maxLength(32), v.regex(/^[a-z][a-z0-9_-]*$/, 'must be a plain id')),
});
export type GlossaryVisual = v.InferOutput<typeof GlossaryVisualSchema>;

export const GlossaryEntrySchema = v.strictObject({
  id: IdSchema,
  title: Text(MAX_GLOSSARY_TITLE),
  /** One line, shown under the title. */
  short: Text(MAX_GLOSSARY_SHORT),
  lines: v.pipe(v.array(Text(MAX_GLOSSARY_LINE)), v.maxLength(MAX_GLOSSARY_LINES)),
  visual: v.optional(GlossaryVisualSchema),
  /** The How to play section its "More" link opens. */
  section: GlossarySectionSchema,
});
export type GlossaryEntry = v.InferOutput<typeof GlossaryEntrySchema>;

export const GlossarySchema = v.pipe(v.array(GlossaryEntrySchema), v.maxLength(200));
export type Glossary = v.InferOutput<typeof GlossarySchema>;

export const HowToPlaySectionSchema = v.strictObject({
  id: GlossarySectionSchema,
  title: Text(MAX_GLOSSARY_TITLE),
  /** Three to five short lines. */
  lines: v.pipe(v.array(Text(MAX_GLOSSARY_LINE)), v.minLength(3), v.maxLength(5)),
});
export type HowToPlaySection = v.InferOutput<typeof HowToPlaySectionSchema>;

/**
 * The worked example of the Combos section: a real Setter whose mark a real creature of the cashing
 * element sets off, and the lines that tell it (two or three, in the order they happen).
 */
export const HowToPlayExampleSchema = v.strictObject({
  title: Text(MAX_GLOSSARY_TITLE),
  setter: IdSchema,
  payoff: IdSchema,
  lines: v.pipe(v.array(Text(MAX_GLOSSARY_LINE)), v.minLength(2), v.maxLength(4)),
});
export type HowToPlayExample = v.InferOutput<typeof HowToPlayExampleSchema>;

export const HowToPlaySchema = v.strictObject({
  sections: v.pipe(v.array(HowToPlaySectionSchema), v.length(GLOSSARY_SECTIONS.length)),
  example: HowToPlayExampleSchema,
});
export type HowToPlay = v.InferOutput<typeof HowToPlaySchema>;

function fail(message: string): never {
  throw new Error(`Invalid glossary: ${message}`);
}

function parse<T>(schema: v.GenericSchema<unknown, T>, raw: unknown, what: string): T {
  const parsed = v.safeParse(schema, raw);
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(`Invalid ${what} schema at "${path}": ${first?.message ?? 'unknown error'}`);
  }
  return parsed.output;
}

/**
 * Validates the glossary (schema, unique ids, and that every picture points at something that
 * exists in the content). Throws an Error naming the first problem. Whether every piece of content
 * HAS an entry is a separate question, answered by `glossaryGaps` and pinned by a test.
 */
export function loadGlossary(raw: unknown, pack: ContentPack): Glossary {
  const glossary = parse(GlossarySchema, raw, 'glossary');
  const seen = new Set<string>();
  for (const entry of glossary) {
    if (seen.has(entry.id)) fail(`duplicate entry id "${entry.id}"`);
    seen.add(entry.id);
    const visual = entry.visual;
    if (visual === undefined) continue;
    const known =
      visual.kind === 'element' || visual.kind === 'mark'
        ? pack.elements.some((e) => e.id === visual.id)
        : visual.kind === 'species'
          ? pack.creatures.some((c) => c.id === visual.id)
          : visual.kind === 'reaction'
            ? pack.reactions.some((r) => r.id === visual.id)
            : true; // glyph ids belong to the client's sprite set, which has its own test
    if (!known) fail(`entry "${entry.id}" has a ${visual.kind} picture of unknown "${visual.id}"`);
  }
  return glossary;
}

/**
 * Validates the How to play text: the sections come in the page's order, and the worked example is
 * a real setter whose mark a real payoff creature cashes in.
 */
export function loadHowToPlay(raw: unknown, pack: ContentPack): HowToPlay {
  const page = parse(HowToPlaySchema, raw, 'how-to-play');
  page.sections.forEach((section, i) => {
    if (section.id !== GLOSSARY_SECTIONS[i]) {
      fail(`section ${String(i + 1)} must be "${GLOSSARY_SECTIONS[i] ?? ''}", got "${section.id}"`);
    }
  });
  const { setter, payoff } = page.example;
  const setterSpecies = pack.creatures.find((c) => c.id === setter);
  const payoffSpecies = pack.creatures.find((c) => c.id === payoff);
  if (setterSpecies === undefined) fail(`the example uses unknown species "${setter}"`);
  if (payoffSpecies === undefined) fail(`the example uses unknown species "${payoff}"`);
  if (setterSpecies.role !== 'setter') fail(`the example's "${setter}" must be a Setter`);
  const reaction = pack.reactions.find((r) => r.markElement === setterSpecies.element);
  if (reaction?.triggerElement !== payoffSpecies.element) {
    fail(
      `the example's "${payoff}" must be of the element that cashes in ${setterSpecies.element}`,
    );
  }
  return page;
}
