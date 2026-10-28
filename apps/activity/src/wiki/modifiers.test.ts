import { describe, expect, it } from 'vitest';
import { anchor, buildWiki, esc } from './build';
import { loadWikiData } from './data';
import { buildWikiCss, GAME_STYLES, type GameCss } from './style';
import { readFileSync } from 'node:fs';
import type { WikiData } from './types';

const data = loadWikiData();
const html = buildWiki(data);
const game = Object.fromEntries(
  Object.entries(GAME_STYLES).map(([name, file]) => [
    name,
    readFileSync(new URL(`../styles/${file}`, import.meta.url), 'utf8'),
  ]),
) as GameCss;
const css = buildWikiCss(game).css;

const CATEGORIES = ['damage', 'marks', 'protection', 'support', 'outside'];

function sectionOf(page: string): string {
  const start = page.indexOf('<section id="modifiers"');
  return page.slice(start, page.indexOf('</section>', start));
}

const section = sectionOf(html);
const rows = [...section.matchAll(/<tr id="(modifier-[^"]*)"([^>]*)>/g)];

/** A data attribute's value on a row's opening tag. */
function attr(tag: string, name: string): string {
  return new RegExp(`\\sdata-${name}="([^"]*)"`).exec(tag)?.[1] ?? '';
}

function row(id: string): string {
  const at = section.indexOf(`<tr id="${id}"`);
  expect(at, id).toBeGreaterThan(-1);
  return section.slice(at, section.indexOf('</tr>', at));
}

describe('the modifier library data', () => {
  it('has every gear line and lab talent as a modifier, in only the five categories', () => {
    expect(data.modifiers.length).toBeGreaterThan(100);
    expect(new Set(data.modifiers.map((m) => m.category))).toEqual(new Set(CATEGORIES));
    for (const m of data.modifiers) {
      expect(m.roles.length, m.id).toBeGreaterThan(0);
      expect(['game', 'lab', 'idea'], m.id).toContain(m.status);
    }
    for (const t of data.draftTalents) {
      expect(
        data.modifiers.filter((m) => m.draftTalents.includes(t.id)),
        t.id,
      ).toHaveLength(1);
    }
    expect(data.modifiers.filter((m) => m.status === 'game').length).toBeGreaterThan(80);
  });

  it('has a unique id and anchor for every modifier', () => {
    const ids = data.modifiers.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const anchors = data.modifiers.map((m) => anchor('modifier', m.id));
    expect(new Set(anchors).size).toBe(anchors.length);
  });
});

describe('the modifier library section', () => {
  it('has a row for every modifier, in the contents, between the current talents and the drafts', () => {
    expect(rows.map((r) => r[1])).toEqual(data.modifiers.map((m) => anchor('modifier', m.id)));
    const nav = html.slice(html.indexOf('<nav class="toc"'), html.indexOf('</nav>'));
    expect(nav).toContain('<a href="#modifiers">Modifiers</a>');
    expect(section).toContain('<h2>Modifiers ');
    const start = html.indexOf('<section id="modifiers"');
    expect(start).toBeGreaterThan(html.indexOf('<section id="current-talents"'));
    expect(start).toBeLessThan(html.indexOf('<section id="knacks"'));
  });

  it('writes what the script filters on as data attributes on every row', () => {
    for (const [i, m] of data.modifiers.entries()) {
      const tag = rows[i]?.[2] ?? '';
      expect(attr(tag, 'category'), m.id).toBe(m.category);
      expect(attr(tag, 'roles'), m.id).toBe(m.roles.join(' '));
      expect(attr(tag, 'status'), m.id).toBe(m.status);
      const text = attr(tag, 'text');
      expect(text, m.id).toBe(text.toLowerCase());
      expect(text, m.id).toContain(esc(m.name.toLowerCase()));
      expect(text, m.id).toContain(esc(m.text.toLowerCase()));
    }
  });

  it('is a two-column table of the modifier and what it does, by category then name', () => {
    expect(section).toContain(
      '<thead><tr><th scope="col" class="mod-name">Modifier</th><th scope="col">What it does</th></tr></thead>',
    );
    for (const r of section.matchAll(/<tr id="modifier-[^]*?<\/tr>/g)) {
      expect(r[0].match(/<t[hd]\b/g)).toHaveLength(2);
    }
    const cats = data.modifiers.map((m) => CATEGORIES.indexOf(m.category));
    expect(cats).toEqual([...cats].sort((a, b) => a - b));
    for (const c of CATEGORIES) {
      const names = data.modifiers.filter((m) => m.category === c).map((m) => m.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    }
  });

  it('shows the category, kind, status and roles of a row as chips', () => {
    const cover = row('modifier-cover');
    expect(cover).toContain('<span class="tag mod-cat">Protection</span>');
    expect(cover).toContain('<span class="tag mod-kind">Stat</span>');
    expect(cover).toContain('mod-status s-game">In the game</span>');
    expect(cover).toContain('<span class="chip-text">Guard</span>');
    expect(row('modifier-edge-walker')).toContain('<span class="chip-text">Any role</span>');
  });

  it('hides the search and filters until the script shows them, and the table never', () => {
    expect(section).toContain('<div class="mod-controls" hidden>');
    expect(section).toContain('<input type="text" id="mod-search"');
    expect(section.slice(section.indexOf('<table'), section.indexOf('</table>'))).not.toMatch(
      /\shidden/,
    );
    for (const group of ['category', 'role', 'status']) {
      expect(section, group).toContain(`data-filter="${group}"`);
    }
    for (const value of [
      ...CATEGORIES,
      'setter',
      'payoff',
      'guard',
      'support',
      'game',
      'lab',
      'idea',
    ]) {
      expect(section, value).toContain(`data-value="${value}"`);
    }
    // The first choice of each filter lets everything through and starts chosen.
    expect(section.match(/data-value="" aria-pressed="true"/g)).toHaveLength(3);
    const n = String(data.modifiers.length);
    expect(section).toContain(`aria-live="polite">${n} / ${n}</p>`);
    expect(css).toMatch(/\.mod-controls\[hidden\]/);
    expect(css).toMatch(/button\.toggle\.on/);
  });

  it('gives every modifier a hover card and links a talent to its modifier and back', () => {
    for (const m of data.modifiers) {
      expect(html, m.id).toContain(`<template id="tip-${anchor('modifier', m.id)}">`);
    }
    const at = html.indexOf('<template id="tip-modifier-cover">');
    const card = html.slice(at, html.indexOf('</template>', at));
    expect(card).toContain('Cover');
    expect(card).toContain('Modifier, in the game');
    expect(card).toContain('Protection');
    const current = data.currentTalents.find((t) => t.modifier === 'cover');
    expect(current).toBeDefined();
    const talent = html.slice(
      html.indexOf(`id="talent-${current?.id ?? ''}"`),
      html.indexOf('</article>', html.indexOf(`id="talent-${current?.id ?? ''}"`)),
    );
    expect(talent).toContain('href="#modifier-cover"');
    // Every modifier a talent names is on the page.
    for (const t of data.currentTalents) {
      if (t.modifier !== undefined) {
        expect(
          data.modifiers.map((m) => m.id),
          t.id,
        ).toContain(t.modifier);
      }
    }
    const draft = html.slice(
      html.indexOf('id="dtalent-broad-back"'),
      html.indexOf('</article>', html.indexOf('id="dtalent-broad-back"')),
    );
    expect(draft).toContain('href="#modifier-cover"');
    expect(row('modifier-cover')).toContain('href="#dtalent-broad-back"');
  });
});

describe('the modifier library from other data', () => {
  function evil(): WikiData {
    const bad = '<script>alert(1)</script> "quoted" & \'single\'';
    return {
      ...data,
      modifiers: [
        {
          id: 'm1',
          name: bad,
          text: bad,
          category: bad,
          roles: ['setter', bad],
          status: bad,
          kind: bad,
          draftTalents: ['missing-talent'],
          also: [bad],
        },
      ],
    };
  }

  it('escapes every text, attribute and link of a modifier', () => {
    const part = sectionOf(buildWiki(evil()));
    expect(part).not.toContain('<script>');
    expect(part).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(part).toMatch(/data-text="&lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;quoted&quot;/);
    expect(part).toMatch(/data-roles="setter &lt;script&gt;/);
    expect(part).not.toMatch(/\son[a-z]+=/);
    // A talent that does not exist is not linked.
    expect(part).not.toContain('missing-talent');
  });

  it('shows a new modifier with no change in the page code', () => {
    const more: WikiData = {
      ...data,
      modifiers: [
        ...data.modifiers,
        {
          id: 'brand-new',
          name: 'Brand New',
          text: 'Does a new thing.',
          category: 'damage',
          roles: ['guard'],
          status: 'idea',
          kind: 'rhythm',
          draftTalents: [],
          also: [],
        },
      ],
    };
    const page = buildWiki(more);
    expect(page).toContain('<tr id="modifier-brand-new" data-category="damage" data-roles="guard"');
    expect(page).toContain('<template id="tip-modifier-brand-new">');
    expect(page).toContain('<span class="tag mod-status s-idea">Idea</span>');
  });
});
