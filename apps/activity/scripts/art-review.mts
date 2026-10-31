// The art review page: every set of the art library and every shipped item look, each piece with Like and Redo
// buttons and a note, for Misa to answer from his phone. Run by `pnpm art review [--out file.html]`; the agent
// then publishes the file with the Artifact tool, declaring `{ db: {}, user: {} }`, at the page's existing URL
// (docs/progress.md). Answers land in the page's database, collection `reviews`, one document per piece
// (`piece`, `verdict`, `note`); read them with the ArtifactData tool. The page itself is `art-review.html`, with
// the data put in place of its `/*DATA*/null` marker. Loads the game through Vite, as `art.mts items` does.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { SpriteDef } from '../src/sprites/sprite-data.ts';
import type { ConceptSet } from '../src/sprites/concepts/index.ts';

interface Flat {
  rows: string[];
  palette: Record<string, string>;
}

/** Writes the review page to `out` and returns how many sets it holds. */
export async function writeReviewPage(out: string): Promise<number> {
  const { createServer } = await import('vite');
  const root = resolve(import.meta.dirname, '..');
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  const sets: unknown[] = [];
  try {
    const { expandRows } = await server.ssrLoadModule('/src/sprites/sprite-data.ts');
    const { CONCEPT_SETS } = (await server.ssrLoadModule('/src/sprites/concepts/index.ts')) as {
      CONCEPT_SETS: readonly ConceptSet[];
    };
    const gear = await server.ssrLoadModule('/src/gear-sprites.ts');
    const { gearContent } = await server.ssrLoadModule('@creatures/game');
    const flat = (def: SpriteDef, over: Readonly<Record<string, string>> = {}): Flat => ({
      rows: expandRows(def),
      palette: { ...def.palette, ...over },
    });
    for (const set of CONCEPT_SETS) {
      sets.push({
        id: set.id,
        title: set.title,
        requested: set.requested,
        status: set.status,
        notes: set.notes ?? [],
        items: Object.entries(set.sprites).map(([id, c]) => ({
          id: `${set.id}/${id}`,
          code: id,
          kind: c.kind,
          role: c.role ?? '',
          note: c.note,
          status: c.status ?? set.status,
          main: flat(c.sprite),
          variants: [
            ...Object.entries(c.alts ?? {}).map(([name, o]) => ({ name, def: flat(c.sprite, o) })),
            ...Object.entries(c.variants ?? {}).map(([name, d]) => ({ name, def: flat(d) })),
          ],
        })),
      });
    }
    type Base = { id: string; name: string; slot: string; flavor?: string };
    const looks = new Map<string, Base[]>();
    for (const base of gearContent.bases as Base[]) {
      const look = gear.itemLookId(base.id) as string;
      looks.set(look, [...(looks.get(look) ?? []), base]);
    }
    const art = (id: string): Flat => {
      const a = gear.itemArt(id) as { sprite: SpriteDef; palette?: Record<string, string> };
      return flat(a.sprite, a.palette ?? {});
    };
    sets.push({
      id: 'items',
      title: 'Gear sprites in the game',
      status: 'shipped',
      notes: [
        'Every item as the game draws it. One card per sprite; the versions show each item that wears it, in its tint and flair.',
      ],
      requested: '2026-10-30 to 31: a sprite per named item, element flair, the neutral coat.',
      items: [...looks].flatMap(([look, wearers]) => {
        const [first, ...rest] = wearers;
        if (first === undefined) return [];
        return [
          {
            id: `items/${look}`,
            code: first.name,
            kind: 'item',
            role: first.slot,
            note:
              wearers.length > 1
                ? `Worn by ${wearers.map((w) => w.name).join(', ')}.`
                : (first.flavor ?? ''),
            status: 'shipped',
            main: art(first.id),
            variants: rest.map((w) => ({ name: w.name, def: art(w.id) })),
          },
        ];
      }),
    });
  } finally {
    await server.close();
  }
  const template = readFileSync(join(import.meta.dirname, 'art-review.html'), 'utf8');
  // `<` escaped so no piece of data can close the script element it is written into.
  const page = template.replace('/*DATA*/null', JSON.stringify(sets).replace(/</g, '\\u003c'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page);
  return sets.length;
}
