/**
 * The guard for "costs show the resource's icon and a number, never its name" (Misa, 2026-11-06, decisions
 * `2026-11-06-costs-show-the-resource-s-icon`): no source file of the client may build text out of a number followed by
 * a resource's name ("12 Acorns", `${n} scrap`, `${count} ${resourceName('bait')}`). An amount is a count badge
 * (`ui/CountBadge`, items from `resource-count.ts`). Words stay only where they are spoken (an `aria-label`, a
 * visually hidden span, the text a screen reader gets), where a glossary explains what a resource is, in the
 * prototypes and dev tools, and in the few lines listed in `ALLOWED` with the reason.
 */
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>(['./**/*.ts', './**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The names of the resources, as the library and the old copy say them. */
const NAME =
  '(?:Bait|Acorns?|Essence|[Ss]crap|[Ss]hards?|Glimmer|glimmer|(?:Tide|Ember|Grove|Spark|Mire) [Ss]hards?)';
/** A number, then (maybe) a template hole for a name, then the name. */
const AMOUNT_THEN_NAME = new RegExp(
  [
    // A literal number and a name: "12 Acorns".
    `\\b\\d+ ${NAME}\\b`,
    // A template hole and a name: `${String(n)} Acorns`, `${n} scrap`.
    `\\$\\{[^}]*\\}\\s+${NAME}\\b`,
    // A template hole and a name taken from the library: `${n} ${resourceName('bait')}`.
    `\\$\\{[^}]*\\}\\s+\\$\\{(?:resourceName|partName|shardName|elementName)\\(`,
    // JSX: {amount} Acorns, {amount} {resourceName(...)}.
    `\\}\\s+${NAME}\\b`,
    `\\}\\s+\\{(?:resourceName|partName|shardName)\\(`,
  ].join('|'),
);

/** Files that may say resource names next to numbers, with why. */
const EXEMPT_FILES: readonly { test: RegExp; why: string }[] = [
  { test: /\.test\.tsx?$/, why: 'tests say what they check' },
  { test: /^\.\/(?:workbench|proto|dev)\//, why: 'fixtures, prototypes and the dev tools' },
  { test: /(?:^|\/)[^/]*-samples?\.tsx?$/, why: 'sample data' },
  { test: /^\.\/(?:HowToPlay|HowToPlayArt)\.tsx$/, why: 'how to play explains what a resource is' },
  { test: /^\.\/sprites\/concepts\//, why: 'art studio notes' },
  { test: /^\.\/(?:wiki)\//, why: 'the wiki explains the content' },
];

/**
 * Lines that name a resource next to a number on purpose: text only a screen reader hears, or help text. Matched
 * by file and a fragment of the line; every entry says why.
 */
const ALLOWED: readonly { file: string; fragment: string; why: string }[] = [
  {
    file: './CurrencyPile.tsx',
    fragment: 'Currencies: ',
    why: 'the HUD button`s spoken label',
  },
  {
    file: './dungeon-text.ts',
    fragment: 'In your pack: ',
    why: 'the run strip`s spoken label; the screen draws `packItems`',
  },
  {
    file: './dungeon-text.ts',
    fragment: '([kind, name]) =>',
    why: 'the spoken pack text (`packText`)',
  },
  { file: './dungeon-text.ts', fragment: 'partName(kind)}`', why: 'the spoken pack text' },
  {
    file: './creature-page/TalentBookDrawer.tsx',
    fragment: 'aria-label',
    why: 'a button`s spoken name',
  },
  {
    file: './creature-page/TalentBookV2Drawer.tsx',
    fragment: 'aria-label',
    why: 'a button`s spoken name',
  },
  { file: './TreatBox.tsx', fragment: 'spoken=', why: 'the switch`s spoken name' },
  {
    file: './resource-count.ts',
    fragment: 'part.label',
    why: 'the words of a `Say` for assistive technology',
  },
  {
    file: './resource-count.ts',
    fragment: 'part.amount',
    why: 'the words of a `Say` for assistive technology',
  },
  {
    file: './game.ts',
    fragment: 'Not enough',
    why: 'a refusal names what ran out (no amount)',
  },
  {
    file: './gear-view.ts',
    fragment: 'You got these parts back',
    why: 'the one-time conversion card of an old migration',
  },
  {
    file: './gear-view.ts',
    fragment: 'Your upgrade',
    why: 'the one-time conversion card of an old migration',
  },
  {
    file: './gear-view.ts',
    fragment: 'partName(e.kind)',
    why: '`partsText`, only the one-time conversion card of an old migration uses it',
  },
  {
    file: './live.ts',
    fragment: 'You got ${',
    why: 'the finale reveal`s words for a screen reader; no screen draws them (the reveal draws badges)',
  },
  {
    file: './raid-progress.ts',
    fragment: 'fully fused',
    why: 'the Festival grant sentence, read aloud only (`revealSummary`)',
  },
  {
    file: './valley/gazette/coming-home.ts',
    fragment: 'Home: ',
    why: 'the coming-home moment`s status region, read aloud while the badges fly',
  },
  {
    file: './valley/forge-view.ts',
    fragment: 'shardName = ',
    why: 'a shard pile`s spoken name',
  },
  {
    file: './valley/commons-view.ts',
    fragment: 'capital(shardName(',
    why: 'a give row`s spoken name (`GiveRow.name`); the screen draws `item`',
  },
  {
    file: './valley/market-view.ts',
    fragment: 'shards`',
    why: 'the broker`s `towardName` for assistive technology',
  },
  {
    file: './valley/ForgeAnvils.tsx',
    fragment: 'aria-label',
    why: 'a button`s spoken name',
  },
  {
    file: './valley/Exchange.tsx',
    fragment: 'label={`',
    why: 'a slot`s spoken name',
  },
  {
    file: './valley/MarketPage.tsx',
    fragment: 'label={`',
    why: 'a slot`s spoken name',
  },
];

function exempt(file: string): boolean {
  return EXEMPT_FILES.some((e) => e.test.test(file));
}

function allowed(file: string, line: string): boolean {
  return ALLOWED.some((a) => a.file === file && line.includes(a.fragment));
}

describe('costs show the resource icon and a number, never its name', () => {
  it('finds the client sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(300);
  });

  it('builds no text out of a number and a resource name', () => {
    const found: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      if (exempt(file)) continue;
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        const code = line.trim();
        // Comments say what the code does; only code is checked.
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
        if (!AMOUNT_THEN_NAME.test(line)) return;
        if (/aria-label|visually-hidden|spoken/.test(line)) return;
        if (allowed(file, line)) return;
        found.push(`${file}:${String(i + 1)}: ${code}`);
      });
    }
    expect(
      found,
      'a cost, price, need or holding is a count badge (ui/CountBadge, resource-count.ts), not words',
    ).toEqual([]);
  });

  it('the guard catches what it is for', () => {
    for (const bad of [
      'const a = `${String(n)} Acorns`;',
      "const b = `${n} ${resourceName('bait')}`;",
      "const c = '12 scrap';",
      '<p>{amount} Essence</p>',
      '<p>{count} {resourceName(id)}</p>',
      'x = `${String(price.scrap)} scrap`;',
    ]) {
      expect(AMOUNT_THEN_NAME.test(bad), bad).toBe(true);
    }
    for (const fine of [
      "const a = 'Bait';",
      '<CountBadge {...acornCount(n)} />',
      'const t = `Level ${String(level)} / ${String(max)}`;',
      'const u = `${creatureName(c)} earned the ribbon`;',
    ]) {
      expect(AMOUNT_THEN_NAME.test(fine), fine).toBe(false);
    }
  });
});
