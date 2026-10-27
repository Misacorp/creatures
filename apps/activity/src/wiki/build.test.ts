import { describe, expect, it } from 'vitest';
import { anchor, buildWiki, esc } from './build';
import { loadWikiData } from './data';
import { WIKI_CSS } from './style';
import type { WikiData } from './types';

const data = loadWikiData();
const html = buildWiki(data);

function idsOf(text: string): string[] {
  return [...text.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1] ?? '');
}

/** The markup of the entry with this id (an article or a section). */
function entry(text: string, id: string): string {
  const start = text.indexOf(`id="${id}"`);
  expect(start, `entry ${id}`).toBeGreaterThan(-1);
  const end = text.indexOf('</article>', start);
  return text.slice(start, end);
}

/** A small fake data set whose texts try to break out of the page. */
function fake(): WikiData {
  const evil = '<script>alert(1)</script> "quoted" & \'single\'';
  return {
    art: [{ id: 'evil-1', src: '/wiki-art/evil\'"x.svg', svg: '<svg></svg>' }],
    creatures: [
      {
        id: 'evil-1',
        name: evil,
        line: 'evil-line',
        stage: 1,
        element: 'tide',
        rarity: 'common',
        role: 'setter',
        levelCap: 15,
        baseStats: { hp: 1, atk: 2, spd: 3 },
        growth: { hp: 1, atk: 1, spd: 1 },
        evolvesTo: [],
        festival: false,
        flavor: evil,
        ability: { name: evil, description: evil },
        talents: ['t1', 'missing-talent'],
        knacks: ['k1', 'missing-knack'],
        draftTalents: ['d1'],
      },
    ],
    currentTalents: [{ id: 't1', name: evil, text: evil, about: evil, signature: false }],
    knacks: [{ id: 'k1', name: evil, family: 'F', text: `${evil} {Mark} {Nothing}`, intent: evil }],
    draftTalents: [{ id: 'd1', name: evil, text: evil, intent: evil, roles: ['setter'] }],
    draftPools: [{ line: 'evil-line', talents: ['d1'] }],
    keywords: [{ name: 'Mark', means: evil, not: evil, step: evil }],
    families: [{ name: 'F', text: evil }],
    elements: [{ id: 'tide', name: evil }],
    elementChart: [{ attacker: 'tide', defender: 'tide', bp: 15_000 }],
  };
}

describe('the wiki page of the real data', () => {
  it('has an entry for every creature form, with its line', () => {
    expect(data.creatures.length).toBeGreaterThan(20);
    const ids = new Set(idsOf(html));
    for (const c of data.creatures) {
      expect(ids.has(anchor('creature', c.id)), c.id).toBe(true);
      expect(ids.has(anchor('line', c.line)), c.line).toBe(true);
    }
  });

  it('has an entry for every current talent, Knack, draft talent, keyword, family and element', () => {
    const ids = new Set(idsOf(html));
    const wanted = [
      ...data.currentTalents.map((t) => anchor('talent', t.id)),
      ...data.knacks.map((k) => anchor('knack', k.id)),
      ...data.draftTalents.map((t) => anchor('dtalent', t.id)),
      ...data.keywords.map((k) => anchor('keyword', k.name)),
      ...data.families.map((f) => anchor('family', f.name)),
      ...data.elements.map((e) => anchor('element', e.id)),
    ];
    expect(wanted.length).toBeGreaterThan(80);
    expect(wanted.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('uses every id once', () => {
    const ids = idsOf(html);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('has no link to an id that is not on the page', () => {
    const ids = new Set(idsOf(html));
    const hrefs = [...html.matchAll(/href="#([^"]*)"/g)].map((m) => m[1] ?? '');
    expect(hrefs.length).toBeGreaterThan(1000);
    expect(hrefs.filter((h) => !ids.has(h))).toEqual([]);
  });

  it('only has ids of lower-case letters, digits and hyphens', () => {
    expect(idsOf(html).filter((id) => !/^[a-z0-9-]+$/.test(id))).toEqual([]);
  });

  it('links each form to its Knacks, its current talents, its draft talents and its relatives', () => {
    for (const c of data.creatures) {
      const part = entry(html, anchor('creature', c.id));
      for (const id of c.knacks) expect(part, `${c.id} ${id}`).toContain(`href="#knack-${id}"`);
      for (const id of c.talents) expect(part, `${c.id} ${id}`).toContain(`href="#talent-${id}"`);
      for (const id of c.draftTalents) {
        expect(part, `${c.id} ${id}`).toContain(`href="#dtalent-${id}"`);
      }
      for (const id of c.evolvesTo)
        expect(part, `${c.id} ${id}`).toContain(`href="#creature-${id}"`);
    }
  });

  it('links each Knack and talent back to the forms that have it', () => {
    for (const k of data.knacks) {
      const part = entry(html, anchor('knack', k.id));
      for (const c of data.creatures.filter((x) => x.knacks.includes(k.id))) {
        expect(part, `${k.id} on ${c.id}`).toContain(`href="#creature-${c.id}"`);
      }
    }
    for (const t of data.currentTalents) {
      const part = entry(html, anchor('talent', t.id));
      for (const c of data.creatures.filter((x) => x.talents.includes(t.id))) {
        expect(part, `${t.id} on ${c.id}`).toContain(`href="#creature-${c.id}"`);
      }
    }
    for (const t of data.draftTalents) {
      const part = entry(html, anchor('dtalent', t.id));
      for (const c of data.creatures.filter((x) => x.draftTalents.includes(t.id))) {
        expect(part, `${t.id} on ${c.id}`).toContain(`href="#creature-${c.id}"`);
      }
    }
  });

  it('links the keywords in a Knack text and the Knack to its family', () => {
    const steady = entry(html, 'knack-steady-mark');
    expect(steady).toContain('href="#keyword-seal"');
    expect(steady).toContain('href="#family-seal"');
    expect(steady).not.toContain('{');
  });

  it('shows the finale ability and the design intent', () => {
    const splashet = data.creatures.find((c) => c.id === 'splashet');
    expect(splashet?.ability).not.toBeNull();
    expect(entry(html, 'creature-splashet')).toContain(splashet?.ability?.name ?? 'x');
    expect(entry(html, 'knack-steady-mark')).toContain('Design intent');
  });

  it('labels the combat v2 sections as a draft', () => {
    for (const id of ['knacks', 'draft-talents', 'keywords', 'families']) {
      const start = html.indexOf(`<section id="${id}"`);
      expect(html.slice(start, start + 600), id).toContain('Draft, not in the game yet');
    }
  });

  it('has one same-origin script and no inline script, style, style attribute or event handler', () => {
    expect(html.match(/<script[^>]*>[^]*?<\/script>/gi)).toEqual([
      '<script type="module" src="/wiki.js"></script>',
    ]);
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('href="/wiki.css"');
  });

  it('has a stylesheet with no remote or font loading', () => {
    expect(WIKI_CSS).not.toMatch(/@import|url\(|@font-face/);
  });
});

/** The `<a>` links (with their inner markup) of a piece of the page whose target starts with `prefix`. */
function linksTo(text: string, prefix: string): { target: string; inner: string }[] {
  return [...text.matchAll(/<a href="#([^"]*)">([^]*?)<\/a>/g)]
    .map((m) => ({ target: m[1] ?? '', inner: m[2] ?? '' }))
    .filter((l) => l.target.startsWith(prefix));
}

describe('creature pictures', () => {
  const art = new Map(data.art.map((a) => [a.id, a.src]));
  const base = (line: string): string | undefined =>
    data.creatures.find((c) => c.line === line && c.stage === 1)?.id;

  it('has a picture for most forms, each a file the build writes', () => {
    expect(art.size).toBeGreaterThan(20);
    for (const a of data.art) {
      expect(a.src).toMatch(/^\/wiki-art\/creature-[a-z0-9-]+\.svg$/);
      expect(a.svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /);
      expect(a.svg).not.toMatch(/<script|\son[a-z]+=/i);
    }
    expect(new Set(data.art.map((a) => a.src)).size).toBe(data.art.length);
  });

  it('shows a picture before every link that names a creature form', () => {
    const links = linksTo(html, 'creature-');
    expect(links.length).toBeGreaterThan(300);
    for (const l of links) {
      const id = l.target.slice('creature-'.length);
      const src = art.get(id);
      if (src === undefined) expect(l.inner, l.target).not.toContain('<img');
      else expect(l.inner, l.target).toMatch(new RegExp(`^<img [^>]*src="${src}"[^>]*>[^<]`));
    }
  });

  it('shows the base form before every link that names a line', () => {
    const links = [...linksTo(html, 'line-'), ...linksTo(html, 'pool-')];
    expect(links.length).toBeGreaterThan(40);
    for (const l of links) {
      const line = l.target.replace(/^(line|pool)-/, '');
      const id = base(line);
      const src = id === undefined ? undefined : art.get(id);
      if (src === undefined) expect(l.inner, l.target).not.toContain('<img');
      else expect(l.inner, l.target).toMatch(new RegExp(`^<img [^>]*src="${src}"`));
    }
  });

  it('sizes every picture, marks it decorative and loads it lazily (cards load on show)', () => {
    const imgs = [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
    expect(imgs.length).toBeGreaterThan(1000);
    for (const img of imgs) {
      expect(img).toMatch(/ width="\d+" height="\d+" alt="" loading="lazy">$/);
      expect(img).toMatch(/src="\/wiki-art\//);
    }
    expect(WIKI_CSS).toMatch(/\.sprite \{[^}]*image-rendering: pixelated/);
  });

  it('puts the picture in a creature entry and in a line heading', () => {
    expect(entry(html, 'creature-splashet')).toMatch(
      /<h4><img class="sprite"[^>]*creature-splashet\.svg/,
    );
    expect(entry(html, 'line-splashet')).toMatch(
      /<h3><img class="sprite"[^>]*creature-splashet\.svg/,
    );
  });
});

describe('hover cards', () => {
  /** The content of the card of an entry. */
  function card(text: string, target: string): string {
    const start = text.indexOf(`<template id="tip-${target}">`);
    expect(start, `card ${target}`).toBeGreaterThan(-1);
    return text.slice(start, text.indexOf('</template>', start));
  }

  it('has a card for every link into an entry, and for no one else', () => {
    const ids = new Set(idsOf(html));
    const templates = new Set([...html.matchAll(/<template id="tip-([^"]*)"/g)].map((m) => m[1]));
    const sections = new Set([
      'top',
      'creatures',
      'current-talents',
      'knacks',
      'draft-talents',
      'keywords',
      'families',
      'elements',
    ]);
    const hrefs = [...html.matchAll(/<a href="#([^"]*)">/g)]
      .map((m) => m[1] ?? '')
      .filter((h) => !sections.has(h));
    expect(hrefs.length).toBeGreaterThan(1000);
    expect(hrefs.filter((h) => !templates.has(h))).toEqual([]);
    // Each template belongs to an entry on the page.
    expect([...templates].filter((t) => !ids.has(t ?? ''))).toEqual([]);
    // No id inside a card (the template's own is the only one), and no link or script.
    expect(idsOf(html).filter((id) => id.startsWith('tip-')).length).toBe(templates.size);
    for (const t of html.matchAll(/<template id="tip-[^"]*">([^]*?)<\/template>/g)) {
      expect(t[1]).not.toMatch(/\sid=|<a[\s>]|<script|\sstyle=|\son[a-z]+=/i);
    }
  });

  it('shows a creature its picture, name, every form of its line, role and element', () => {
    for (const c of data.creatures) {
      const part = card(html, anchor('creature', c.id));
      const src = data.art.find((a) => a.id === c.id)?.src;
      if (src !== undefined) expect(part, c.id).toContain(`src="${src}"`);
      expect(part, c.id).toContain(`<strong class="pv-name">${esc(c.name)}</strong>`);
      for (const f of data.creatures.filter((x) => x.line === c.line)) {
        expect(part, `${c.id} ${f.id}`).toContain(`<span>${esc(f.name)}</span>`);
      }
      expect(part.match(/pv-form here/g), c.id).toHaveLength(1);
      expect(part, c.id).toContain(`<span class="pv-label">Role:</span> ${c.role}`);
      const element = data.elements.find((e) => e.id === c.element);
      expect(part, c.id).toContain(`</span> ${esc(element?.name ?? c.element)}</p>`);
    }
  });

  it('shows a Knack its name, family and text, and a talent its name and effect', () => {
    const knack = card(html, 'knack-steady-mark');
    expect(knack).toContain('Steady Mark');
    expect(knack).toContain('Seal family');
    expect(knack).not.toContain('{');
    const k = data.knacks.find((x) => x.id === 'steady-mark');
    expect(knack).toContain(esc((k?.text ?? 'x').replace(/[{}]/g, '')));
    const t = data.currentTalents[0];
    const talent = card(html, anchor('talent', t?.id ?? 'x'));
    expect(talent).toContain(esc(t?.name ?? 'x'));
    expect(talent).toContain(esc(t?.text ?? 'x'));
    expect(talent).toContain(esc(t?.about ?? 'x'));
  });

  it('shows a line its base form and all forms, and a keyword, family and element their meaning', () => {
    const line = card(html, 'line-splashet');
    expect(line).toContain('Splashet line');
    expect(line).toContain('creature-splashet.svg');
    expect(line).not.toContain('pv-form here');
    const keyword = data.keywords[0];
    expect(card(html, anchor('keyword', keyword?.name ?? 'x'))).toContain(
      esc(keyword?.means ?? 'x'),
    );
    const family = data.families[0];
    expect(card(html, anchor('family', family?.name ?? 'x'))).toContain(esc(family?.text ?? 'x'));
    const element = data.elements[0];
    expect(card(html, anchor('element', element?.id ?? 'x'))).toContain('Harder against');
  });
});

describe('the wiki page from other data', () => {
  it('escapes every text from the data', () => {
    const page = buildWiki(fake());
    expect(page).not.toContain('<script>');
    // The only script is the page's own, by address.
    expect(page.match(/<script/gi)).toHaveLength(1);
    expect(page).toContain('<script type="module" src="/wiki.js"></script>');
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(page).toContain('&quot;quoted&quot; &amp; &#39;single&#39;');
    // Nothing but the page's own tags: every `<` is the start of a known tag.
    const tags = new Set(
      [...page.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => (m[1] ?? '').toLowerCase()),
    );
    expect([...tags].filter((t) => t === 'iframe' || t === 'object' || t === 'embed')).toEqual([]);
    // A picture's address from the data is escaped too, and a picture's tag has only the known attributes.
    expect(page).toContain('src="/wiki-art/evil&#39;&quot;x.svg"');
    expect(page).not.toMatch(/\son[a-z]+=/i);
    for (const img of page.matchAll(/<img\s([^>]*)>/g)) {
      const attrs = [...(img[1] ?? '').matchAll(/([a-z]+)="/g)].map((m) => m[1]);
      expect(attrs).toEqual(['class', 'src', 'width', 'height', 'alt', 'loading']);
    }
  });

  it('draws a link only when the target exists, and the page has no dangling link', () => {
    const page = buildWiki(fake());
    expect(page).not.toContain('missing-knack"');
    expect(page).not.toContain('{Nothing}');
    const ids = new Set(idsOf(page));
    const hrefs = [...page.matchAll(/href="#([^"]*)"/g)].map((m) => m[1] ?? '');
    expect(hrefs.filter((h) => !ids.has(h))).toEqual([]);
    expect(page).toContain('href="#keyword-mark"');
  });

  it('keeps an anchor to lower-case letters, digits and hyphens', () => {
    expect(anchor('knack', 'Bad Id"><script>')).toBe('knack-bad-id-script');
    expect(anchor('knack', '***')).toBe('knack-x');
    expect(esc('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('needs no wiki code change to show a new creature, Knack or talent', () => {
    const more = fake();
    const first = more.creatures[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    more.creatures.push({ ...first, id: 'brand-new', name: 'Brand New', knacks: ['k-new'] });
    more.knacks.push({
      id: 'k-new',
      name: 'Fresh Knack',
      family: 'F',
      text: 'Plain.',
      intent: 'x',
    });
    const page = buildWiki(more);
    expect(entry(page, 'creature-brand-new')).toContain('href="#knack-k-new"');
    expect(entry(page, 'knack-k-new')).toContain('href="#creature-brand-new"');
    // It has a hover card, with its line's forms; with art it gets its picture, without it none.
    expect(page).toContain('<template id="tip-creature-brand-new">');
    expect(page).toContain('<template id="tip-knack-k-new">');
    expect(page).not.toMatch(/<a href="#creature-brand-new"><img/);
    more.art.push({ id: 'brand-new', src: '/wiki-art/creature-brand-new.svg', svg: '<svg></svg>' });
    const withArt = buildWiki(more);
    expect(withArt).toMatch(
      /<a href="#creature-brand-new"><img class="sprite" src="\/wiki-art\/creature-brand-new\.svg"/,
    );
    expect(withArt).toMatch(/<template id="tip-creature-brand-new"><div class="pv-head"><img /);
  });

  it('uses the stage 1 form for a line mention, and none when a line has no art', () => {
    const more = fake();
    const first = more.creatures[0];
    if (first === undefined) throw new Error('no creature');
    more.creatures = [
      { ...first, id: 'b-2', name: 'Bee Two', stage: 2, line: 'bee' },
      { ...first, id: 'b-1', name: 'Bee One', stage: 1, line: 'bee', evolvesTo: ['b-2'] },
    ];
    more.draftPools = [{ line: 'bee', talents: ['d1'] }];
    more.art = [
      { id: 'b-2', src: '/wiki-art/creature-b-2.svg', svg: '<svg></svg>' },
      { id: 'b-1', src: '/wiki-art/creature-b-1.svg', svg: '<svg></svg>' },
    ];
    const page = buildWiki(more);
    expect(page).toMatch(
      /<a href="#line-bee"><img class="sprite" src="\/wiki-art\/creature-b-1\.svg"/,
    );
    expect(page).toMatch(
      /<a href="#pool-bee"><img class="sprite" src="\/wiki-art\/creature-b-1\.svg"/,
    );
    more.art = [{ id: 'b-2', src: '/wiki-art/creature-b-2.svg', svg: '<svg></svg>' }];
    const noBase = buildWiki(more);
    expect(noBase).not.toMatch(/<a href="#line-bee"><img/);
    expect(noBase).toMatch(/<a href="#creature-b-2"><img/);
  });
});
