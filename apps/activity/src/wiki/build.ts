/**
 * The wiki page as one HTML string, built from `WikiData` (see `data.ts`). Pure: no I/O, so it is
 * unit tested. The page has no inline script and no inline style (the Content-Security-Policy forbids
 * both): it links to `wiki.css` and to one same-origin script, `wiki.js`, that shows the hover cards
 * (`hover.ts`; the cards' content is generated here, in `previews.ts`). Creature pictures are the SVG
 * files of `art.ts`. Every text and attribute value goes through `esc`, and every anchor id is
 * made by `anchor`, which keeps only `[a-z0-9-]`. A link is drawn only when its target exists, so the
 * page never has a dangling `#link`.
 */
import { anchor, capital, chip, chipClasses, esc, keywordsIn, type Kind } from './html';
import { modifiersSection } from './modifiers';
import { buildPreviews } from './previews';
import { draftTalentsTable, groupLines, knacksTable, lineName, viewSwitch } from './tables';
import type {
  WikiCreature,
  WikiCurrentTalent,
  WikiData,
  WikiDraftTalent,
  WikiKnack,
  WikiModifier,
} from './types';

export { anchor, esc };

/** The sizes of a creature picture: beside a name in running text, and before a heading. */
const INLINE = 32;
const HEAD = 48;
/** A creature's portrait in its entry (the game's page portrait is 56 px) and an element icon in a chip (the game draws it at twice its 8 px). */
const PORTRAIT = 56;
const ICON = 16;

class Page {
  private readonly known = new Map<Kind, Set<string>>();
  /** The picture of each creature form that has one, by creature id. */
  private readonly art = new Map<string, string>();
  /** The icon of each element that has one, by element id. */
  private readonly icons = new Map<string, string>();
  /** The base form (stage 1) of each line, by line. */
  private readonly base = new Map<string, string>();

  constructor(data: WikiData) {
    for (const a of data.art) this.art.set(a.id, a.src);
    for (const a of data.elementArt) this.icons.set(a.id, a.src);
    for (const c of data.creatures) {
      const current = data.creatures.find((x) => x.id === this.base.get(c.line));
      if (current === undefined || (c.stage === 1 && current.stage !== 1)) {
        this.base.set(c.line, c.id);
      }
    }
  }

  /** A creature form's small picture, or nothing when it has no art. */
  creature(id: string, size = INLINE): string {
    const src = this.art.get(id);
    if (src === undefined) return '';
    return `<img class="sprite" src="${esc(src)}" width="${String(size)}" height="${String(size)}" alt="" loading="lazy">`;
  }

  /** An element's small icon, or nothing when it has none. */
  element(id: string, size = ICON): string {
    const src = this.icons.get(id);
    if (src === undefined) return '';
    return `<img class="sprite" src="${esc(src)}" width="${String(size)}" height="${String(size)}" alt="" loading="lazy">`;
  }

  /**
   * One of the game's chips for an element, a role or a rarity, a link to its entry (the same chip as plain
   * text when there is no such entry).
   */
  tag(kind: 'element' | 'role' | 'rarity', id: string, label: string): string {
    const classes = chipClasses[kind](id);
    const link = this.known.get(kind)?.has(id) === true ? { href: `#${anchor(kind, id)}` } : {};
    const icon = kind === 'element' ? this.element(id) : '';
    return chip({ classes, text: label, ...(icon === '' ? {} : { icon }), ...link });
  }

  /** The picture of a line: its base form (stage 1). */
  line(line: string, size = INLINE): string {
    const id = this.base.get(line);
    return id === undefined ? '' : this.creature(id, size);
  }

  private picture(kind: Kind, id: string): string {
    if (kind === 'creature') return this.creature(id);
    if (kind === 'line' || kind === 'pool') return this.line(id);
    return '';
  }

  /** Registers an entry of the page so links to it are drawn. */
  declare(kind: Kind, id: string): void {
    const set = this.known.get(kind) ?? new Set<string>();
    set.add(id);
    this.known.set(kind, set);
  }

  /** A link to an entry, or plain text when there is no such entry. */
  link(kind: Kind, id: string, label: string): string {
    if (this.known.get(kind)?.has(id) !== true) return esc(label);
    return `<a href="#${esc(anchor(kind, id))}">${this.picture(kind, id)}${esc(label)}</a>`;
  }

  /** A comma-separated list of links, or a dash for none. */
  links(kind: Kind, items: readonly { id: string; label: string }[]): string {
    if (items.length === 0) return '<span class="none">none</span>';
    return items.map((i) => this.link(kind, i.id, i.label)).join(', ');
  }

  /** Text with `{Keyword}` markers drawn as links to the keyword entries (the braces are dropped). */
  rich(text: string): string {
    let out = '';
    let last = 0;
    for (const m of text.matchAll(/\{([^}]+)\}/g)) {
      out += esc(text.slice(last, m.index));
      out += this.link('keyword', m[1] ?? '', m[1] ?? '');
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }
}

/** Entries laid out in a responsive grid: columns where the width allows, one column on a phone. */
function entriesGrid(entries: string): string {
  return `<div class="entries">\n${entries}\n</div>`;
}

function heading(level: 2 | 3 | 4, id: string, text: string, icon = ''): string {
  // The id sits on the section or article around the heading, so each id is on the page once.
  return `<h${String(level)}>${icon}${esc(text)} <a class="self" href="#${esc(id)}" aria-label="Link to ${esc(text)}">#</a></h${String(level)}>`;
}

function foundOn(page: Page, creatures: readonly WikiCreature[]): string {
  return `<p class="found"><span class="label">Found on:</span> ${page.links(
    'creature',
    creatures.map((c) => ({ id: c.id, label: c.name })),
  )}</p>`;
}

/** The stat block: the game's creature-page stat table, with the level 1 and level cap values and the growth. */
function statBlock(c: WikiCreature): string {
  const rows: [string, 'hp' | 'atk' | 'spd'][] = [
    ['HP', 'hp'],
    ['Attack', 'atk'],
    ['Speed', 'spd'],
  ];
  const body = rows
    .map(
      ([label, stat]) =>
        `<tr class="data-row"><th scope="row"><span class="data-label">${label}</span></th><td>${String(c.baseStats[stat])}</td><td>${String(c.capStats[stat])}</td><td class="data-extra">+${String(c.growth[stat])}</td></tr>`,
    )
    .join('');
  return `<div class="cp-block stats pix-panel">
<h5 class="cp-title">Stats</h5>
<table class="data-table headed tabular" aria-label="Stats of ${esc(c.name)}"><thead><tr><th scope="col">Stat</th><th scope="col">Lv 1</th><th scope="col">Lv ${String(c.levelCap)}</th><th scope="col">Per level</th></tr></thead><tbody>${body}</tbody></table>
</div>`;
}

function creatureEntry(page: Page, data: WikiData, c: WikiCreature): string {
  const byId = new Map(data.creatures.map((x) => [x.id, x]));
  const name = (id: string): { id: string; label: string } => ({
    id,
    label: byId.get(id)?.name ?? id,
  });
  const from = data.creatures.filter((x) => x.evolvesTo.includes(c.id)).map((x) => name(x.id));
  const talents = new Map(data.currentTalents.map((t) => [t.id, t]));
  const knacks = new Map(data.knacks.map((k) => [k.id, k]));
  const draft = new Map(data.draftTalents.map((t) => [t.id, t]));
  const rows: [string, string][] = [
    ['Evolves from', page.links('creature', from)],
    ['Evolves into', page.links('creature', c.evolvesTo.map(name))],
    [
      'Finale ability (in the game today)',
      c.ability === null
        ? '<span class="none">none</span>'
        : `<strong>${esc(c.ability.name)}</strong>: ${esc(c.ability.description)}`,
    ],
    [
      'Talents (in the game today)',
      page.links(
        'talent',
        c.talents.map((id) => ({ id, label: talents.get(id)?.name ?? id })),
      ),
    ],
    [
      'Knacks (combat v2 draft)',
      page.links(
        'knack',
        c.knacks.map((id) => ({ id, label: knacks.get(id)?.name ?? id })),
      ),
    ],
    [
      'Draft talent pool (its line)',
      page.links(
        'dtalent',
        c.draftTalents.map((id) => {
          const t = draft.get(id);
          const idle = t !== undefined && !t.roles.includes(c.role);
          return { id, label: `${t?.name ?? id}${idle ? ' (idle on this form)' : ''}` };
        }),
      ),
    ],
  ];
  const facts = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('');
  const elementName = data.elements.find((e) => e.id === c.element)?.name ?? capital(c.element);
  const roleName = data.roles.find((r) => r.id === c.role)?.name ?? capital(c.role);
  const tags = [
    page.tag('element', c.element, elementName),
    page.tag('role', c.role, roleName),
    page.tag('rarity', c.rarity, capital(c.rarity)),
    `<span class="tag">Stage ${String(c.stage)}</span>`,
    ...(c.festival ? ['<span class="badge festival">Festival</span>'] : []),
  ].join('');
  const id = anchor('creature', c.id);
  const portrait = page.creature(c.id, PORTRAIT);
  return `<article class="entry" id="${esc(id)}">
<div class="cc-head">
<div class="portrait">${portrait}</div>
<div class="cc-id">
<h4 class="cc-name rarity-name ${esc(anchor('rarity', c.rarity))}">${esc(c.name)} <a class="self" href="#${esc(id)}" aria-label="Link to ${esc(c.name)}">#</a></h4>
<p class="cc-tags">${tags}</p>
</div>
</div>
<p class="flavor">${esc(c.flavor)}</p>
${statBlock(c)}
<dl class="facts">${facts}</dl>
</article>`;
}

function creaturesSection(page: Page, data: WikiData): string {
  const groups = groupLines(data.creatures);
  const index = groups
    .map((g) => {
      const forms = g.forms.map((f) => page.link('creature', f.id, f.name)).join(', ');
      return `<li>${page.link('line', g.line, lineName(g.forms))}: ${forms}</li>`;
    })
    .join('\n');
  const body = groups
    .map(
      (g) => `<section class="line-group" id="${esc(anchor('line', g.line))}">
<header class="line-head">
${heading(3, anchor('line', g.line), lineName(g.forms), page.line(g.line, HEAD))}
</header>
<div class="line-forms">
${g.forms.map((f) => creatureEntry(page, data, f)).join('\n')}
</div>
</section>`,
    )
    .join('\n');
  return `<section id="creatures">
${heading(2, 'creatures', 'Creatures')}
<p>Every creature form, grouped by line. Talents and Knacks link to their entries further down; each entry links back here.</p>
<ul class="index">
${index}
</ul>
${body}
</section>`;
}

/** A line that links a talent to the modifier entry it is the effect of, or nothing when it has none. */
function modifierLine(page: Page, m: WikiModifier | undefined): string {
  if (m === undefined) return '';
  return `\n<p class="found"><span class="label">Modifier:</span> ${page.link('modifier', m.id, m.name)}</p>`;
}

function currentTalentEntry(
  page: Page,
  t: WikiCurrentTalent,
  on: WikiCreature[],
  modifier: WikiModifier | undefined,
): string {
  return `<article class="entry" id="${esc(anchor('talent', t.id))}">
${heading(4, anchor('talent', t.id), t.name)}
<p><strong>${esc(t.text)}</strong>${t.signature ? ' <span class="tag">signature</span>' : ''}</p>
<p>${esc(t.about)}</p>${modifierLine(page, modifier)}
${foundOn(page, on)}
</article>`;
}

function currentTalentsSection(page: Page, data: WikiData): string {
  const entries = data.currentTalents
    .map((t) =>
      currentTalentEntry(
        page,
        t,
        data.creatures.filter((c) => c.talents.includes(t.id)),
        data.modifiers.find((m) => m.id === t.modifier),
      ),
    )
    .join('\n');
  return `<section id="current-talents">
${heading(2, 'current-talents', 'Current talents (in the game today)')}
<p>The talents a creature can roll or carry now. Every form of a line shares the line's pool. Values shown are the normal ones; a golden talent is 1.5 times as big.</p>
${entriesGrid(entries)}
</section>`;
}

function knackEntry(page: Page, k: WikiKnack, on: WikiCreature[]): string {
  return `<article class="entry" id="${esc(anchor('knack', k.id))}">
${heading(4, anchor('knack', k.id), k.name)}
<p><span class="label">Family:</span> ${page.link('family', k.family, k.family)}</p>
<p>${page.rich(k.text)}</p>
<p class="intent"><span class="label">Design intent:</span> ${esc(k.intent)}</p>
${foundOn(page, on)}
</article>`;
}

const DRAFT_NOTE =
  '<p class="draft">Draft, not in the game yet. This is the combat v2 design Misa has not accepted; it can change.</p>';

function knacksSection(page: Page, data: WikiData): string {
  const entries = data.knacks
    .map((k) =>
      knackEntry(
        page,
        k,
        data.creatures.filter((c) => c.knacks.includes(k.id)),
      ),
    )
    .join('\n');
  return `<section id="knacks">
${heading(2, 'knacks', 'Combat v2 draft: Knacks')}
${DRAFT_NOTE}
<p>Every Knack as a list of entries, or as a table of the creature forms that know it.</p>
${viewSwitch('knacks', entriesGrid(entries), knacksTable(page, data))}
</section>`;
}

function draftTalentEntry(
  page: Page,
  t: WikiDraftTalent,
  lines: string[],
  on: WikiCreature[],
  modifier: WikiModifier | undefined,
): string {
  return `<article class="entry" id="${esc(anchor('dtalent', t.id))}">
${heading(4, anchor('dtalent', t.id), t.name)}
<p>${page.rich(t.text)}</p>
<p class="intent"><span class="label">Design intent:</span> ${esc(t.intent)}</p>
<p class="found"><span class="label">Works for:</span> ${esc(t.roles.map(capital).join(', '))}</p>${modifierLine(page, modifier)}
<p class="found"><span class="label">In the pools of:</span> ${page.links(
    'pool',
    lines.map((l) => ({ id: l, label: `${capital(l)} line` })),
  )}</p>
${foundOn(page, on)}
</article>`;
}

function draftTalentsSection(page: Page, data: WikiData): string {
  const pools = data.draftPools
    .map((p) => {
      const names = new Map(data.draftTalents.map((t) => [t.id, t.name]));
      return `<li id="${esc(anchor('pool', p.line))}">${page.line(p.line)}<strong>${esc(capital(p.line))} line</strong>: ${page.links(
        'dtalent',
        p.talents.map((id) => ({ id, label: names.get(id) ?? id })),
      )}</li>`;
    })
    .join('\n');
  const entries = data.draftTalents
    .map((t) =>
      draftTalentEntry(
        page,
        t,
        data.draftPools.filter((p) => p.talents.includes(t.id)).map((p) => p.line),
        data.creatures.filter((c) => c.draftTalents.includes(t.id)),
        data.modifiers.find((m) => m.draftTalents.includes(t.id)),
      ),
    )
    .join('\n');
  return `<section id="draft-talents">
${heading(2, 'draft-talents', 'Combat v2 draft: talents')}
${DRAFT_NOTE}
<p>One shared library of talents; each creature line rolls from its own pool of it (branch forms share the line's pool). A talent that does nothing for a form's role is idle on it.</p>
${viewSwitch(
  'draft-talents',
  `<ul class="index">
${pools}
</ul>
${entriesGrid(entries)}`,
  draftTalentsTable(page, data),
)}
</section>`;
}

function keywordsSection(page: Page, data: WikiData): string {
  const usedBy = (name: string): string => {
    const k = data.knacks.filter((x) => keywordsIn(x.text).includes(name));
    const t = data.draftTalents.filter((x) => keywordsIn(x.text).includes(name));
    const items = [
      ...k.map((x) => page.link('knack', x.id, x.name)),
      ...t.map((x) => page.link('dtalent', x.id, x.name)),
    ];
    return items.length === 0 ? '<span class="none">none</span>' : items.join(', ');
  };
  const keywords = data.keywords
    .map(
      (k) => `<article class="entry" id="${esc(anchor('keyword', k.name))}">
${heading(4, anchor('keyword', k.name), k.name)}
<p><span class="label">Means:</span> ${esc(k.means)}</p>
<p><span class="label">Does not mean:</span> ${esc(k.not)}</p>
<p class="intent"><span class="label">Rules:</span> ${esc(k.step)}</p>
<p class="found"><span class="label">Used in:</span> ${usedBy(k.name)}</p>
</article>`,
    )
    .join('\n');
  const families = data.families
    .map((f) => {
      const members = data.knacks.filter((k) => k.family === f.name);
      return `<article class="entry" id="${esc(anchor('family', f.name))}">
${heading(4, anchor('family', f.name), f.name)}
<p>${esc(f.text)}</p>
<p class="found"><span class="label">Knacks:</span> ${page.links(
        'knack',
        members.map((k) => ({ id: k.id, label: k.name })),
      )}</p>
</article>`;
    })
    .join('\n');
  return `<section id="keywords">
${heading(2, 'keywords', 'Combat v2 draft: keywords')}
${DRAFT_NOTE}
${entriesGrid(keywords)}
</section>
<section id="families">
${heading(2, 'families', 'Combat v2 draft: Knack families')}
${DRAFT_NOTE}
<p>A family is one rule with different numbers or elements.</p>
${entriesGrid(families)}
</section>`;
}

function elementsSection(page: Page, data: WikiData): string {
  const name = new Map(data.elements.map((e) => [e.id, e.name]));
  const list = (element: string, strong: boolean): string =>
    page.links(
      'element',
      data.elementChart
        .filter((p) => p.attacker === element && (strong ? p.bp > 10_000 : p.bp < 10_000))
        .map((p) => ({ id: p.defender, label: name.get(p.defender) ?? p.defender })),
    );
  const entries = data.elements
    .map(
      (e) => `<article class="entry" id="${esc(anchor('element', e.id))}">
${heading(4, anchor('element', e.id), e.name)}
<p><span class="label">Hits harder against:</span> ${list(e.id, true)}</p>
<p><span class="label">Hits softer against:</span> ${list(e.id, false)}</p>
<p class="found"><span class="label">Creatures:</span> ${page.links(
        'creature',
        data.creatures.filter((c) => c.element === e.id).map((c) => ({ id: c.id, label: c.name })),
      )}</p>
</article>`,
    )
    .join('\n');
  return `<section id="elements">
${heading(2, 'elements', 'Elements')}
<p>The element chart: a hit against the listed elements deals more or less damage.</p>
${entriesGrid(entries)}
</section>`;
}

function rolesSection(page: Page, data: WikiData): string {
  const entries = data.roles
    .map((r) => {
      const lines =
        r.lines.length === 0
          ? ''
          : `\n<ul class="lines">${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
      return `<article class="entry" id="${esc(anchor('role', r.id))}">
${heading(4, anchor('role', r.id), r.name, r.species === null ? '' : page.creature(r.species, HEAD))}
<p><strong>${esc(r.short)}</strong></p>${lines}
<p class="found"><span class="label">Creatures:</span> ${page.links(
        'creature',
        data.creatures.filter((c) => c.role === r.id).map((c) => ({ id: c.id, label: c.name })),
      )}</p>
</article>`;
    })
    .join('\n');
  return `<section id="roles">
${heading(2, 'roles', 'Roles')}
<p>What a creature does in a fight, in the game's own words. Each creature shows its role as a tag.</p>
${entriesGrid(entries)}
</section>`;
}

function raritiesSection(page: Page, data: WikiData): string {
  // The game has one glossary entry for rarity, so every rarity shares its words.
  const about = data.rarities[0];
  const intro =
    about === undefined
      ? ''
      : `<p><strong>${esc(about.short)}</strong></p>\n<ul class="lines">${about.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  const entries = data.rarities
    .map(
      (r) => `<article class="entry" id="${esc(anchor('rarity', r.id))}">
<h4 class="cc-name rarity-name ${esc(anchor('rarity', r.id))}">${esc(r.name)} <a class="self" href="#${esc(anchor('rarity', r.id))}" aria-label="Link to ${esc(r.name)}">#</a></h4>
<p class="found"><span class="label">Creatures:</span> ${page.links(
        'creature',
        data.creatures.filter((c) => c.rarity === r.id).map((c) => ({ id: c.id, label: c.name })),
      )}</p>
</article>`,
    )
    .join('\n');
  return `<section id="rarities">
${heading(2, 'rarities', 'Rarities')}
${intro}
${entriesGrid(entries)}
</section>`;
}

/** The main sections, in page order: the table of contents lists them (the creature lines go under Creatures). */
const TOC: readonly (readonly [string, string])[] = [
  ['creatures', 'Creatures'],
  ['current-talents', 'Current talents (in the game today)'],
  ['modifiers', 'Modifiers'],
  ['knacks', 'Combat v2 draft: Knacks'],
  ['draft-talents', 'Combat v2 draft: talents'],
  ['keywords', 'Combat v2 draft: keywords'],
  ['families', 'Combat v2 draft: Knack families'],
  ['elements', 'Elements'],
  ['roles', 'Roles'],
  ['rarities', 'Rarities'],
];

/** The whole page. `css` is the stylesheet's address (the plugin emits it next to the page). */
export function buildWiki(data: WikiData, css = '/wiki.css', script = '/wiki.js'): string {
  const page = new Page(data);
  for (const c of data.creatures) {
    page.declare('creature', c.id);
    page.declare('line', c.line);
  }
  for (const t of data.currentTalents) page.declare('talent', t.id);
  for (const m of data.modifiers) page.declare('modifier', m.id);
  for (const k of data.knacks) page.declare('knack', k.id);
  for (const t of data.draftTalents) page.declare('dtalent', t.id);
  for (const k of data.keywords) page.declare('keyword', k.name);
  for (const f of data.families) page.declare('family', f.name);
  for (const e of data.elements) page.declare('element', e.id);
  for (const p of data.draftPools) page.declare('pool', p.line);
  for (const r of data.roles) page.declare('role', r.id);
  for (const r of data.rarities) page.declare('rarity', r.id);

  const lineLinks = groupLines(data.creatures)
    .map((g) => `<li>${page.link('line', g.line, lineName(g.forms))}</li>`)
    .join('\n');
  const toc = TOC.map(([id, label]) => {
    const sub = id === 'creatures' ? `\n<ol class="toc-lines">\n${lineLinks}\n</ol>` : '';
    return `<li><a href="#${esc(id)}">${esc(label)}</a>${sub}</li>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Leet Creatures wiki</title>
<link rel="stylesheet" href="${esc(css)}">
<script type="module" src="${esc(script)}"></script>
</head>
<body>
<div class="page">
<header class="top">
<h1 id="top">Leet Creatures wiki</h1>
<p>A reference to the game's configuration. It is generated from the game data on every deploy, so it is always up to date. It is not linked from the game.</p>
</header>
<div class="layout">
<nav class="toc" aria-label="Contents">
<ol>
${toc}
</ol>
</nav>
<main>
${creaturesSection(page, data)}
${currentTalentsSection(page, data)}
${modifiersSection(page, data)}
${knacksSection(page, data)}
${draftTalentsSection(page, data)}
${keywordsSection(page, data)}
${elementsSection(page, data)}
${rolesSection(page, data)}
${raritiesSection(page, data)}
</main>
</div>
</div>
<a class="to-top" href="#top">Back to top</a>
${buildPreviews(page, data)}
</body>
</html>
`;
}
