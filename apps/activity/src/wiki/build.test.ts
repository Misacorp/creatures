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

  it('is static: no script, no inline style, no style attribute, no event handler', () => {
    expect(html).not.toMatch(/<script/i);
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

describe('the wiki page from other data', () => {
  it('escapes every text from the data', () => {
    const page = buildWiki(fake());
    expect(page).not.toContain('<script>');
    expect(page).not.toMatch(/<script/i);
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(page).toContain('&quot;quoted&quot; &amp; &#39;single&#39;');
    // Nothing but the page's own tags: every `<` is the start of a known tag.
    const tags = new Set(
      [...page.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => (m[1] ?? '').toLowerCase()),
    );
    expect([...tags].filter((t) => t === 'script' || t === 'img' || t === 'iframe')).toEqual([]);
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
  });
});
