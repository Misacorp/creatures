/**
 * The wiki page as one HTML string, built from `WikiData` (see `data.ts`). Pure: no I/O, so it is
 * unit tested. The page is static (no script, no inline style: the Content-Security-Policy forbids both)
 * and links to `wiki.css`. Every text and attribute value goes through `esc`, and every anchor id is
 * made by `anchor`, which keeps only `[a-z0-9-]`. A link is drawn only when its target exists, so the
 * page never has a dangling `#link`.
 */
import type {
  WikiCreature,
  WikiCurrentTalent,
  WikiData,
  WikiDraftTalent,
  WikiKnack,
} from './types';

/** HTML-escapes text for element content and for double- or single-quoted attribute values. */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** An anchor id: a kind prefix and the content id, lower case, only `a-z`, `0-9` and `-`. */
export function anchor(kind: string, id: string): string {
  const clean = id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${kind}-${clean === '' ? 'x' : clean}`;
}

/** The `{Keyword}` markers of a text. */
function keywordsIn(text: string): string[] {
  return [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '');
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What the page can link to, by kind and content id. */
type Kind =
  'creature' | 'line' | 'talent' | 'knack' | 'dtalent' | 'keyword' | 'family' | 'element' | 'pool';

class Page {
  private readonly known = new Map<Kind, Set<string>>();

  /** Registers an entry of the page so links to it are drawn. */
  declare(kind: Kind, id: string): void {
    const set = this.known.get(kind) ?? new Set<string>();
    set.add(id);
    this.known.set(kind, set);
  }

  /** A link to an entry, or plain text when there is no such entry. */
  link(kind: Kind, id: string, label: string): string {
    if (this.known.get(kind)?.has(id) !== true) return esc(label);
    return `<a href="#${esc(anchor(kind, id))}">${esc(label)}</a>`;
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

function heading(level: 2 | 3 | 4, id: string, text: string): string {
  // The id sits on the section or article around the heading, so each id is on the page once.
  return `<h${String(level)}>${esc(text)} <a class="self" href="#${esc(id)}" aria-label="Link to ${esc(text)}">#</a></h${String(level)}>`;
}

function foundOn(page: Page, creatures: readonly WikiCreature[]): string {
  return `<p class="found"><span class="label">Found on:</span> ${page.links(
    'creature',
    creatures.map((c) => ({ id: c.id, label: c.name })),
  )}</p>`;
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
  const g = c.growth;
  const rows: [string, string][] = [
    [
      'Type',
      `${page.link('element', c.element, capital(c.element))}, ${esc(c.role)}, ${esc(c.rarity)}, stage ${String(c.stage)}${c.festival ? ', Festival only' : ''}`,
    ],
    [
      'Stats at level 1',
      `HP ${String(c.baseStats.hp)}, Attack ${String(c.baseStats.atk)}, Speed ${String(c.baseStats.spd)} (per level: +${String(g.hp)}, +${String(g.atk)}, +${String(g.spd)}); level cap ${String(c.levelCap)}`,
    ],
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
  return `<article class="entry" id="${esc(anchor('creature', c.id))}">
${heading(4, anchor('creature', c.id), c.name)}
<p class="flavor">${esc(c.flavor)}</p>
<dl>${facts}</dl>
</article>`;
}

/** The creatures grouped by line, in content order. */
function lines(data: WikiData): { line: string; forms: WikiCreature[] }[] {
  const out: { line: string; forms: WikiCreature[] }[] = [];
  for (const c of data.creatures) {
    const group = out.find((g) => g.line === c.line);
    if (group === undefined) out.push({ line: c.line, forms: [c] });
    else group.forms.push(c);
  }
  return out;
}

function creaturesSection(page: Page, data: WikiData): string {
  const groups = lines(data);
  const index = groups
    .map((g) => {
      const forms = g.forms.map((f) => page.link('creature', f.id, f.name)).join(', ');
      return `<li>${page.link('line', g.line, lineName(g.forms))}: ${forms}</li>`;
    })
    .join('\n');
  const body = groups
    .map(
      (g) => `<section class="line" id="${esc(anchor('line', g.line))}">
${heading(3, anchor('line', g.line), lineName(g.forms))}
${g.forms.map((f) => creatureEntry(page, data, f)).join('\n')}
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

function lineName(forms: readonly WikiCreature[]): string {
  const first = forms.find((f) => f.stage === 1) ?? forms[0];
  return `${first?.name ?? 'Unknown'} line`;
}

function currentTalentEntry(page: Page, t: WikiCurrentTalent, on: WikiCreature[]): string {
  return `<article class="entry" id="${esc(anchor('talent', t.id))}">
${heading(4, anchor('talent', t.id), t.name)}
<p><strong>${esc(t.text)}</strong>${t.signature ? ' <span class="tag">signature</span>' : ''}</p>
<p>${esc(t.about)}</p>
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
      ),
    )
    .join('\n');
  return `<section id="current-talents">
${heading(2, 'current-talents', 'Current talents (in the game today)')}
<p>The talents a creature can roll or carry now. Every form of a line shares the line's pool. Values shown are the normal ones; a golden talent is 1.5 times as big.</p>
${entries}
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
${entries}
</section>`;
}

function draftTalentEntry(
  page: Page,
  t: WikiDraftTalent,
  lines: string[],
  on: WikiCreature[],
): string {
  return `<article class="entry" id="${esc(anchor('dtalent', t.id))}">
${heading(4, anchor('dtalent', t.id), t.name)}
<p>${page.rich(t.text)}</p>
<p class="intent"><span class="label">Design intent:</span> ${esc(t.intent)}</p>
<p class="found"><span class="label">Works for:</span> ${esc(t.roles.map(capital).join(', '))}</p>
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
      return `<li id="${esc(anchor('pool', p.line))}"><strong>${esc(capital(p.line))} line</strong>: ${page.links(
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
      ),
    )
    .join('\n');
  return `<section id="draft-talents">
${heading(2, 'draft-talents', 'Combat v2 draft: talents')}
${DRAFT_NOTE}
<p>One shared library of talents; each creature line rolls from its own pool of it (branch forms share the line's pool). A talent that does nothing for a form's role is idle on it.</p>
<ul class="index">
${pools}
</ul>
${entries}
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
${keywords}
</section>
<section id="families">
${heading(2, 'families', 'Combat v2 draft: Knack families')}
${DRAFT_NOTE}
<p>A family is one rule with different numbers or elements.</p>
${families}
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
${entries}
</section>`;
}

/** The whole page. `css` is the stylesheet's address (the plugin emits it next to the page). */
export function buildWiki(data: WikiData, css = '/wiki.css'): string {
  const page = new Page();
  for (const c of data.creatures) {
    page.declare('creature', c.id);
    page.declare('line', c.line);
  }
  for (const t of data.currentTalents) page.declare('talent', t.id);
  for (const k of data.knacks) page.declare('knack', k.id);
  for (const t of data.draftTalents) page.declare('dtalent', t.id);
  for (const k of data.keywords) page.declare('keyword', k.name);
  for (const f of data.families) page.declare('family', f.name);
  for (const e of data.elements) page.declare('element', e.id);
  for (const p of data.draftPools) page.declare('pool', p.line);

  const toc = [
    ['creatures', 'Creatures'],
    ['current-talents', 'Current talents (in the game today)'],
    ['knacks', 'Combat v2 draft: Knacks'],
    ['draft-talents', 'Combat v2 draft: talents'],
    ['keywords', 'Combat v2 draft: keywords'],
    ['families', 'Combat v2 draft: Knack families'],
    ['elements', 'Elements'],
  ]
    .map(([id, label]) => `<li><a href="#${esc(id ?? '')}">${esc(label ?? '')}</a></li>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Leet Creatures wiki</title>
<link rel="stylesheet" href="${esc(css)}">
</head>
<body>
<main>
<header>
<h1 id="top">Leet Creatures wiki</h1>
<p>A reference to the game's configuration. It is generated from the game data on every deploy, so it is always up to date. It is not linked from the game.</p>
<nav aria-label="Contents">
<ol>
${toc}
</ol>
</nav>
</header>
${creaturesSection(page, data)}
${currentTalentsSection(page, data)}
${knacksSection(page, data)}
${draftTalentsSection(page, data)}
${keywordsSection(page, data)}
${elementsSection(page, data)}
<footer><a href="#top">Back to the top</a></footer>
</main>
</body>
</html>
`;
}
