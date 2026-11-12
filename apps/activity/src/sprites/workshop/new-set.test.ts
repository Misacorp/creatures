import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadHousingContent, resources } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import bosses from '../../../../../packages/game/src/content/data/bosses.json';
import destinations from '../../../../../packages/game/src/content/data/destinations.json';
import journal from '../../../../../packages/game/src/content/data/journal.json';
import { spriteSize, validateSprite } from '../sprite-data';
import { lintSprite } from '../sprite-lint';
import {
  PATHS,
  SHIPPED_SET_IDS,
  blueprintHint,
  commentSafe,
  fromPaths,
  packSource,
  parseArgs,
  parseSpec,
  planNewSet,
  planRemoveSet,
  styleSource,
  type Changes,
  type PlanContext,
  type SetSpec,
} from './new-set';
import { placeholderHand } from './placeholder';
import { PLAIN_PINE } from './sample/plain-pine';
import { SET_FORMS } from './style';

/** `pnpm housing new-set` and `remove-set` as pure plans, run on the real files in memory (nothing is written). */

const ROOT = new URL('../../../../../', import.meta.url);

function disk(path: string): string | undefined {
  try {
    return readFileSync(new URL(path, ROOT), 'utf8');
  } catch {
    return undefined;
  }
}

/** The files as they are on disk, with a plan's changes laid over them. */
function files(): { read: (path: string) => string | undefined; apply: (c: Changes) => void } {
  const over = new Map<string, string | null>();
  const read = (path: string): string | undefined => {
    if (over.has(path)) return over.get(path) ?? undefined;
    return disk(path);
  };
  return {
    read,
    apply: (changes) => {
      for (const [path, text] of changes) over.set(path, text);
    },
  };
}

const ctx = (read: (p: string) => string | undefined): PlanContext => ({
  placeNames: Object.fromEntries(destinations.map((d) => [d.id, d.name])),
  bossNames: Object.fromEntries(bosses.map((b) => [b.id, b.name])),
  fromSource: fromPaths('plain-pine')
    .map((p) => read(p))
    .find((s) => s !== undefined),
});

const spec = (extra: Record<string, string> = {}): SetSpec => parseSpec('unit-oak', extra);

describe('parseSpec', () => {
  it('fills the plainest set that validates', () => {
    const s = spec();
    expect(s).toMatchObject({
      id: 'unit-oak',
      name: 'Unit Oak',
      from: 'plain-pine',
      element: null,
      tier: 1,
      primary: { family: 'wood' },
      accent: { family: 'stone' },
      places: [],
      bosses: [],
    });
    expect(s.theme).toContain('TODO');
  });

  it('reads the flags and refuses bad ones', () => {
    const s = spec({
      '--name': 'Quiet Verge',
      '--element': 'void',
      '--tier': '2',
      '--primary': 'driftwood',
      '--accent': 'family:metal',
      '--places': 'tidepools, moonlit-reef',
      '--moments': 'trip,raid',
    });
    expect(s).toMatchObject({
      name: 'Quiet Verge',
      element: 'void',
      tier: 2,
      primary: { material: 'driftwood' },
      accent: { family: 'metal' },
      places: ['tidepools', 'moonlit-reef'],
      moments: ['trip', 'raid'],
    });
    expect(() => parseSpec('Bad_Id', {})).toThrow(/kebab/);
    expect(() => parseSpec('a-very-long-set-id-indeed', {})).toThrow(/too long/);
    expect(() => spec({ '--tier': '3' })).toThrow(/tier/);
    expect(() => spec({ '--accent': 'family:glass' })).toThrow(/family/);
    expect(() => spec({ '--moments': 'nap' })).toThrow(/moments/);
    expect(() => spec({ '--from': '../../etc' })).toThrow(/--from/);
    expect(() => spec({ '--from': 'Tide Pool' })).toThrow(/--from/);
  });
});

describe('the command line', () => {
  it('reads flags with values, bool flags and the rest in order', () => {
    expect(parseArgs(['unit-oak', '--tier', '2', '--dry-run', '--force'])).toEqual({
      flags: { '--tier': '2', '--dry-run': 'true', '--force': 'true' },
      positional: ['unit-oak'],
    });
  });

  it('refuses a flag left without its value at the end or before another flag', () => {
    expect(() => parseArgs(['unit-oak', '--name'])).toThrow(/--name needs a value/);
    expect(() => parseArgs(['unit-oak', '--tier', '--dry-run'])).toThrow(/--tier needs a value/);
  });
});

describe('generated files stay well formed whatever the name says', () => {
  it('copies "$" in a name as written (no replacement patterns) and never ends a comment early', () => {
    const { read } = files();
    const name = "Cost $& $1 $' */ Oak";
    const odd = parseSpec('unit-oak', { '--name': name, '--theme': 'stars */ and $$' });
    const style = styleSource(odd, read(PATHS.style('tidepool')) ?? '');
    expect(style).toContain(`name: ${JSON.stringify(name)}`);
    const header = style.slice(0, style.indexOf('*/') + 2);
    expect(header).toContain(commentSafe('stars */ and $$'));
    expect(header).toContain('Cost $& $1');
    const pack = packSource(odd);
    expect(pack.indexOf('*/')).toBeGreaterThan(pack.indexOf('TODO(artist)'));
    expect(commentSafe('a */ b')).toBe('a * / b');
  });
});

describe('the shipped sets', () => {
  it('are exactly Cosy and the content sets whose words are written (no TODO left)', () => {
    const finished = housing.sets
      .filter((set) => {
        const texts = [
          set.line,
          set.theme,
          set.keepsake.line,
          ...housing.pieces.filter((p) => p.set === set.id).map((p) => p.line),
        ];
        return !texts.some((t) => /TODO/.test(t ?? ''));
      })
      .map((set) => set.id);
    expect([...SHIPPED_SET_IDS].sort()).toEqual([...new Set(['cosy', ...finished])].sort());
  });
});

describe('blueprintHint', () => {
  it('names the places and bosses, or the moments when there are none', () => {
    const c = ctx(files().read);
    expect(blueprintHint(spec({ '--places': 'tidepools', '--bosses': 'tidal-colossus' }), c)).toBe(
      'A blueprint from the Tidepools or the Tidal Colossus.',
    );
    expect(blueprintHint(spec(), c)).toBe('A blueprint from trips, scouts or raids.');
  });
});

describe('new-set, as a plan', () => {
  it('adds the set to every place that holds a set, and the result is valid housing content', () => {
    const { read, apply } = files();
    const changes = planNewSet(spec(), read, ctx(read));
    expect([...changes.keys()].sort()).toEqual(
      [
        PATHS.sets,
        PATHS.pieces,
        PATHS.skins,
        PATHS.style('unit-oak'),
        PATHS.pack('unit-oak'),
        PATHS.concept('unit-oak'),
        PATHS.setsTs,
        PATHS.compendium,
      ].sort(),
    );
    const lastOf = (path: string): string => {
      const rows = JSON.parse(read(path) ?? '[]') as { id: string; set: string | null }[];
      return rows.filter((r) => r.set !== null).at(-1)?.id ?? '';
    };
    const [lastPiece, lastSkin] = [lastOf(PATHS.pieces), lastOf(PATHS.skins)];
    apply(changes);
    const parse = (path: string): { id: string; form?: string; kind?: string; set?: string }[] =>
      JSON.parse(read(path) ?? '[]') as never;
    const pieces = parse(PATHS.pieces).filter((p) => p.set === 'unit-oak');
    expect(pieces.map((p) => p.id)).toEqual(SET_FORMS.map((f) => `unit-oak-${f}`));
    expect(pieces.map((p) => p.form)).toEqual([...SET_FORMS]);
    expect(
      parse(PATHS.skins)
        .filter((s) => s.set === 'unit-oak')
        .map((s) => [s.id, s.kind]),
    ).toEqual([
      ['unit-oak-wall', 'wall'],
      ['unit-oak-floor', 'floor'],
    ]);
    // the content loader accepts it: schema, ids, sources, materials
    const loaded = loadHousingContent(
      {
        ...housing,
        sets: parse(PATHS.sets),
        pieces: parse(PATHS.pieces),
        skins: parse(PATHS.skins),
      },
      resources,
      {
        journalSets: journal.sets.map((s) => s.id),
        bosses: bosses.map((b) => b.id),
        destinations: destinations.map((d) => d.id),
      },
    );
    expect(loaded.sets.map((s) => s.id)).toContain('unit-oak');
    // the new rows follow the last set's rows, not the wild pieces or the room skins
    const ids = parse(PATHS.pieces).map((p) => p.id);
    expect(ids.indexOf('unit-oak-bed')).toBe(ids.indexOf(lastPiece) + 1);
    const skinIds = parse(PATHS.skins).map((p) => p.id);
    expect(skinIds.indexOf('unit-oak-wall')).toBe(skinIds.indexOf(lastSkin) + 1);
  });

  it('writes a style, a pack and a concept wrapper that name the set', () => {
    const { read } = files();
    const changes = planNewSet(spec(), read, ctx(read));
    const style = changes.get(PATHS.style('unit-oak')) ?? '';
    expect(style).toContain('export const UNIT_OAK: Style = {');
    expect(style).toContain("id: 'unit-oak'");
    expect(style).toContain('name: "Unit Oak"');
    expect(style).toContain('TODO(artist)');
    expect(style).not.toContain('PLAIN_PINE');
    const pack = changes.get(PATHS.pack('unit-oak')) ?? '';
    expect(pack).toContain('setPack(SOURCE)');
    expect(pack).toContain('UNIT_OAK');
    expect(pack).toContain('TODO(artist)');
    expect(pack).not.toContain('pieces:');
    const concept = changes.get(PATHS.concept('unit-oak')) ?? '';
    expect(concept).toContain('export const HOUSE_UNIT_OAK: ConceptSet');
    const setsTs = changes.get(PATHS.setsTs) ?? '';
    expect(setsTs).toContain("import { SOURCE as UNIT_OAK } from '../data/house/unit-oak';");
    expect(setsTs).toContain("'unit-oak': UNIT_OAK,");
  });

  it('marks the compendium rows as draft', () => {
    const { read } = files();
    const md = planNewSet(spec(), read, ctx(read)).get(PATHS.compendium) ?? '';
    expect(md).toContain('### Unit Oak set');
    expect(md).toMatch(/\| Unit Oak +\| None +\| Unit Oak Keepsake: TODO line/);
    expect(md).toContain('draft: ');
    expect(md).toMatch(/\| Unit Oak Wallpaper +\| wall/);
    expect(md).toMatch(/\| Unit Oak Floor +\| floor/);
  });

  it('is idempotent: planning again after applying changes nothing', () => {
    const { read, apply } = files();
    apply(planNewSet(spec(), read, ctx(read)));
    expect(planNewSet(spec(), read, ctx(read)).size).toBe(0);
  });

  it('adds only what is missing when a set is half there', () => {
    const { read, apply } = files();
    const first = planNewSet(spec(), read, ctx(read));
    apply(new Map([[PATHS.sets, first.get(PATHS.sets) ?? null]]));
    const rest = planNewSet(spec(), read, ctx(read));
    expect(rest.has(PATHS.sets)).toBe(false);
    expect(rest.has(PATHS.pieces)).toBe(true);
  });

  it('refuses a shipped set, a bad id and a style that is not there', () => {
    const { read } = files();
    expect(() => planNewSet(parseSpec('tidepool', {}), read, ctx(read))).toThrow(/shipped/);
    expect(() =>
      planNewSet(spec({ '--from': 'nope' }), read, { ...ctx(read), fromSource: undefined }),
    ).toThrow(/No style to copy/);
  });

  it('fails a re-run whose flags differ from the rows already written, and says what differs', () => {
    const { read, apply } = files();
    apply(planNewSet(spec(), read, ctx(read)));
    expect(() => planNewSet(spec({ '--tier': '2' }), read, ctx(read))).toThrow(
      /unit-oak is already in .*sets\.json with tier 1; this run asks for 2/,
    );
    expect(() => planNewSet(spec({ '--moments': 'trip' }), read, ctx(read))).toThrow(/sources/);
    // the same flags again: nothing to do, no error
    expect(planNewSet(spec(), read, ctx(read)).size).toBe(0);
  });

  it('copies a shipped style too', () => {
    const { read } = files();
    const source = read(PATHS.style('tidepool')) ?? '';
    const out = styleSource(spec({ '--from': 'tidepool' }), source);
    expect(out).toContain("id: 'unit-oak'");
    expect(out).not.toContain('TIDEPOOL');
    expect(out).toContain("trim: 'scallop'");
  });
});

describe('remove-set, as a plan', () => {
  it('undoes new-set: the files are as before, the new files are gone', () => {
    const { read, apply } = files();
    const before = new Map(
      [PATHS.sets, PATHS.pieces, PATHS.skins, PATHS.setsTs].map((p) => [p, read(p)]),
    );
    apply(planNewSet(spec(), read, ctx(read)));
    const removal = planRemoveSet('unit-oak', read);
    expect(removal.get(PATHS.style('unit-oak'))).toBeNull();
    expect(removal.get(PATHS.pack('unit-oak'))).toBeNull();
    expect(removal.get(PATHS.concept('unit-oak'))).toBeNull();
    apply(removal);
    for (const [path, text] of before) {
      // JSON is formatted by prettier on disk, so compare what it says
      if (path.endsWith('.json'))
        expect(JSON.parse(read(path) ?? ''), path).toEqual(JSON.parse(text ?? ''));
      else expect(read(path), path).toBe(text);
    }
    expect(read(PATHS.compendium)).not.toContain('Unit Oak');
    expect(read(PATHS.compendium)).toBe(disk(PATHS.compendium));
    expect(planRemoveSet('unit-oak', read).size).toBe(0);
  });

  it('refuses a set whose pack was not made by new-set or has hand work since, unless forced', () => {
    const { read, apply } = files();
    apply(planNewSet(spec(), read, ctx(read)));
    const pack = read(PATHS.pack('unit-oak')) ?? '';
    const by = (text: string) => new Map([[PATHS.pack('unit-oak'), text]]);
    apply(by(pack.replace('Made by `pnpm housing new-set', 'Drawn by hand')));
    expect(() => planRemoveSet('unit-oak', read)).toThrow(/not made by .*--force/);
    apply(
      by(
        pack.replace('hand: HAND };', "hand: HAND, pieces: { bed: { use: 'hand', why: 'x' } } };"),
      ),
    );
    expect(() => planRemoveSet('unit-oak', read)).toThrow(/hand work.*--force/);
    expect(planRemoveSet('unit-oak', read, true).get(PATHS.pack('unit-oak'))).toBeNull();
  });

  it('never touches a shipped set', () => {
    const { read } = files();
    for (const id of [
      'cosy',
      'tidepool',
      'lantern-night',
      'quiet-verge',
      'fairground',
      'schoolhouse',
    ]) {
      expect(() => planRemoveSet(id, read)).toThrow(/shipped/);
      expect(() => planNewSet(parseSpec(id, {}), read, ctx(read))).toThrow(/shipped/);
    }
  });
});

describe('placeholder art', () => {
  it('draws a wallpaper, a floor and a keepsake of the right sizes, in the style, passing the lint', () => {
    const pack = placeholderHand({ ...PLAIN_PINE, id: 'unit-oak' });
    const wall = pack.skins?.['unit-oak-wall']?.tile;
    const floor = pack.skins?.['unit-oak-floor']?.tile;
    const keepsake = pack.keepsakes?.['unit-oak'];
    expect(wall && spriteSize(wall)).toEqual({ width: 16, height: 52 });
    expect(floor && spriteSize(floor)).toEqual({ width: 16, height: 8 });
    expect(keepsake && spriteSize(keepsake)).toEqual({ width: 12, height: 12 });
    for (const sprite of [wall, floor, keepsake]) {
      expect(sprite).toBeDefined();
      if (sprite === undefined) continue;
      validateSprite(sprite);
      for (const colour of Object.values(sprite.palette))
        expect(Object.values(PLAIN_PINE.palette)).toContain(colour);
      expect(lintSprite(sprite, { kind: 'free' }).filter((f) => f.level === 'error')).toEqual([]);
    }
  });
});
