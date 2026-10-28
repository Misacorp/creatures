import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { anchor, buildWiki } from './build';
import { loadWikiData } from './data';
import { buildWikiCss, GAME_STYLES, type GameCss } from './style';
import type { WikiData } from './types';

const data = loadWikiData();
/** The forms in column order: by line, in content order. */
function inColumns(d: WikiData): WikiData['creatures'] {
  const lines = [...new Set(d.creatures.map((c) => c.line))];
  return lines.flatMap((l) => d.creatures.filter((c) => c.line === l));
}
const html = buildWiki(data);

function idsOf(text: string): string[] {
  return [...text.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1] ?? '');
}

/** The markup of a section. */
function section(text: string, id: string): string {
  const start = text.indexOf(`<section id="${id}">`);
  expect(start, id).toBeGreaterThan(-1);
  return text.slice(start, text.indexOf('</section>', start));
}

/** The table view of a section, and its parts. */
function tableOf(text: string, id: string): string {
  const part = section(text, id);
  const start = part.indexOf('<div class="view-table">');
  expect(start, id).toBeGreaterThan(-1);
  return part.slice(start);
}

interface Row {
  /** The target of the row's link, and its text. */
  target: string;
  /** Each cell's class, in column order ('' for an empty cell), without the line-start marker. */
  cells: string[];
  /** The cells that start a line. */
  starts: number[];
  raw: string;
}

function rowsOf(table: string): Row[] {
  return [
    ...table.matchAll(/<tr><th scope="row" class="row-name">([^]*?)<\/th>([^]*?)<\/tr>/g),
  ].map((m) => {
    const cells = [...(m[2] ?? '').matchAll(/<td(?: class="([^"]*)")?>([^]*?)<\/td>/g)];
    return {
      target: /href="#([^"]*)"/.exec(m[1] ?? '')?.[1] ?? '',
      cells: cells.map((c) =>
        (c[1] ?? '')
          .split(' ')
          .filter((x) => x !== 'ls')
          .join(' '),
      ),
      starts: cells.flatMap((c, i) => ((c[1] ?? '').split(' ').includes('ls') ? [i] : [])),
      raw: m[2] ?? '',
    };
  });
}

/** The targets of the form header cells, in order, and of the line header cells. */
function headers(table: string): { forms: string[]; lines: string[]; spans: number[] } {
  const forms = /<tr class="forms">([^]*?)<\/tr>/.exec(table)?.[1] ?? '';
  const lines = /<tr class="lines">([^]*?)<\/tr>/.exec(table)?.[1] ?? '';
  return {
    forms: [...forms.matchAll(/<th scope="col"[^>]*><a href="#([^"]*)"/g)].map((m) => m[1] ?? ''),
    lines: [...lines.matchAll(/<th scope="colgroup"[^>]*><a href="#([^"]*)"/g)].map(
      (m) => m[1] ?? '',
    ),
    spans: [...lines.matchAll(/colspan="(\d+)"/g)].map((m) => Number(m[1])),
  };
}

describe('the draft talents table', () => {
  const table = tableOf(html, 'draft-talents');
  const rows = rowsOf(table);

  it('has a row for every draft talent, linked to its entry, in data order', () => {
    expect(data.draftTalents.length).toBeGreaterThan(10);
    expect(rows.map((r) => r.target)).toEqual(
      data.draftTalents.map((t) => anchor('dtalent', t.id)),
    );
  });

  it('has a column for every creature form, in content order, a picture link with a name, grouped by line', () => {
    const h = headers(table);
    expect(h.forms).toEqual(inColumns(data).map((c) => anchor('creature', c.id)));
    const lines = [...new Set(data.creatures.map((c) => c.line))];
    expect(h.lines).toEqual(lines.map((l) => anchor('line', l)));
    expect(h.spans).toEqual(lines.map((l) => data.creatures.filter((c) => c.line === l).length));
    for (const c of inColumns(data)) {
      const link = new RegExp(
        `<a href="#creature-${c.id}" class="pic">(<img [^>]*alt="" [^>]*>)<span class="vh">${c.name}</span></a>`,
      );
      if (data.art.some((a) => a.id === c.id)) expect(table, c.id).toMatch(link);
      else expect(table, c.id).toContain(`<span class="fallback">${c.name}</span>`);
    }
  });

  it('marks a cell for the line pool, and an idle mark when the talent does nothing for the role', () => {
    let on = 0;
    let idle = 0;
    for (const [i, t] of data.draftTalents.entries()) {
      const row = rows[i];
      expect(row?.cells).toHaveLength(data.creatures.length);
      for (const [j, c] of inColumns(data).entries()) {
        const inPool = c.draftTalents.includes(t.id);
        const works = t.roles.includes(c.role);
        const want = !inPool ? '' : works ? 'on' : 'idle';
        expect(row?.cells[j], `${t.id} on ${c.id}`).toBe(want);
        if (want === 'on') on += 1;
        if (want === 'idle') idle += 1;
      }
    }
    // The real draft has both kinds.
    expect(on).toBeGreaterThan(20);
    expect(idle).toBeGreaterThan(0);
  });

  it('separates the lines: the first form of each line starts a gap, in every row', () => {
    const lines = new Set(data.creatures.map((c) => c.line));
    const cols = inColumns(data);
    const starts = cols.flatMap((c, i) =>
      cols.findIndex((x) => x.line === c.line) === i ? [i] : [],
    );
    expect(starts).toHaveLength(lines.size);
    for (const row of rows) expect(row.starts).toEqual(starts);
    expect(table.match(/<th scope="colgroup" colspan="\d+" class="ls">/g)).toHaveLength(lines.size);
  });

  it('does not rely on colour: every mark is a shape with words for assistive technology', () => {
    for (const row of rows) {
      for (const cell of row.raw.matchAll(/<td class="(?:on|idle)[^"]*">([^]*?)<\/td>/g)) {
        expect(cell[1]).toMatch(
          /^<span class="mark( alt)?" aria-hidden="true"><\/span><span class="vh">[^<]+<\/span>$/,
        );
      }
    }
    expect(table).toMatch(/<ul class="legend">[^]*class="mark"[^]*class="mark alt"/);
  });
});

describe('the Knacks table', () => {
  const table = tableOf(html, 'knacks');
  const rows = rowsOf(table);

  it('has a row for every Knack, grouped by family, and a column for every form', () => {
    expect(data.knacks.length).toBeGreaterThan(30);
    expect(rows.map((r) => r.target).sort()).toEqual(
      data.knacks.map((k) => anchor('knack', k.id)).sort(),
    );
    const families = [...new Set(data.knacks.map((k) => k.family))];
    const groups = [...table.matchAll(/<tbody>\n<tr class="family-row">/g)];
    expect(groups).toHaveLength(families.length);
    for (const f of families) expect(table).toContain(`<a href="#${anchor('family', f)}">`);
    expect(headers(table).forms).toEqual(inColumns(data).map((c) => anchor('creature', c.id)));
    // Each family's rows follow its heading.
    for (const body of table.split('<tbody>').slice(1)) {
      const family = /href="#family-([^"]*)"/.exec(body)?.[1] ?? '';
      for (const r of rowsOf(body)) {
        const k = data.knacks.find((x) => anchor('knack', x.id) === r.target);
        expect(anchor('family', k?.family ?? ''), r.target).toBe(`family-${family}`);
      }
    }
  });

  it('marks a form that brings the Knack itself differently from one that keeps it', () => {
    let own = 0;
    let kept = 0;
    for (const row of rows) {
      const k = data.knacks.find((x) => anchor('knack', x.id) === row.target);
      for (const [j, c] of inColumns(data).entries()) {
        const has = c.knacks.includes(k?.id ?? '');
        const want = !has ? '' : c.ownKnacks.includes(k?.id ?? '') ? 'own' : 'kept';
        expect(row.cells[j], `${k?.id} on ${c.id}`).toBe(want);
        if (want === 'own') own += 1;
        if (want === 'kept') kept += 1;
      }
    }
    expect(own).toBeGreaterThan(30);
    expect(kept).toBeGreaterThan(0);
    // A stage 2 form that stays in its role keeps what the form before it brought (R11).
    const keeper = data.creatures.find((c) => c.knacks.some((k) => !c.ownKnacks.includes(k)));
    expect(keeper).toBeDefined();
  });

  it('puts the words next to each mark and a legend above the table', () => {
    expect(table).toContain('Brings it');
    expect(table).toContain('Keeps it from the form before');
    expect(table.indexOf('<ul class="legend">')).toBeLessThan(table.indexOf('<table'));
  });
});

describe('the table views as a part of the page', () => {
  it('has a List and Table toggle in both sections, the table chosen to start with', () => {
    for (const id of ['draft-talents', 'knacks']) {
      const part = section(html, id);
      expect(part, id).toContain(
        `<input type="radio" class="view-radio r-list" name="${id}-view" id="${id}-view-list">`,
      );
      expect(part, id).toContain(
        `<input type="radio" class="view-radio r-table" name="${id}-view" id="${id}-view-table" checked>`,
      );
      expect(part, id).toContain(`<label class="l-list" for="${id}-view-list">List</label>`);
      expect(part, id).toContain(`<label class="l-table" for="${id}-view-table">Table</label>`);
      expect(part.indexOf('class="view-list"'), id).toBeLessThan(
        part.indexOf('class="view-table"'),
      );
      // The radios come before the toggle and both views, as the stylesheet's sibling selectors need.
      expect(part.indexOf('r-table'), id).toBeLessThan(part.indexOf('view-toggle'));
      expect(part.indexOf('view-toggle'), id).toBeLessThan(part.indexOf('class="view-list"'));
    }
  });

  it('keeps every entry and its anchor in the list view only', () => {
    for (const [id, prefix, ids] of [
      ['draft-talents', 'dtalent', data.draftTalents.map((t) => t.id)],
      ['knacks', 'knack', data.knacks.map((k) => k.id)],
    ] as const) {
      const part = section(html, id);
      const list = part.slice(
        part.indexOf('class="view-list"'),
        part.indexOf('class="view-table"'),
      );
      for (const e of ids) expect(list, e).toContain(`id="${anchor(prefix, e)}"`);
      expect(idsOf(tableOf(html, id)), id).toEqual([]);
    }
    const all = idsOf(html);
    expect(all.filter((x, i) => all.indexOf(x) !== i)).toEqual([]);
  });

  it('links every table entry to a target with a hover card, and has no inline script, style or handler', () => {
    const ids = new Set(idsOf(html));
    const templates = new Set([...html.matchAll(/<template id="tip-([^"]*)"/g)].map((m) => m[1]));
    for (const id of ['draft-talents', 'knacks']) {
      const table = tableOf(html, id);
      const hrefs = [...table.matchAll(/<a href="#([^"]*)"/g)].map((m) => m[1] ?? '');
      expect(hrefs.length).toBeGreaterThan(data.creatures.length);
      expect(hrefs.filter((h) => !ids.has(h) || !templates.has(h))).toEqual([]);
      expect(table).not.toMatch(/\sstyle=|\son[a-z]+=|<script/i);
    }
  });

  it('hides the view that is not chosen with display: none, and keeps the table in a sideways-only scroller', () => {
    const game = Object.fromEntries(
      Object.entries(GAME_STYLES).map(([name, file]) => [
        name,
        readFileSync(new URL(`../styles/${file}`, import.meta.url), 'utf8'),
      ]),
    ) as GameCss;
    const css = buildWikiCss(game).css;
    expect(css).toMatch(
      /\.r-list:checked ~ \.view-table, \.r-table:checked ~ \.view-list \{ display: none; \}/,
    );
    const wrap = /\.table-wrap \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(wrap).toMatch(/position: relative/);
    expect(wrap).toMatch(/overflow-x: auto/);
    // No scrollbar of its own up and down: the table is as tall as its rows, and the page scrolls.
    expect(wrap).not.toMatch(/max-height|overflow-y|overflow: auto/);
    expect(css).not.toMatch(/\.matrix thead th \{ position: sticky/);
    expect(css).toMatch(/\.matrix \{ width: 100%;/);
    expect(css).toMatch(/\.matrix \.row-name \{[^}]*position: sticky[^}]*left: 0/);
    // The game's own segmented layout is taken, not copied.
    expect(css).toMatch(/\.segmented \{[^}]*display: flex/);
    // A link into a hidden list switches the section to it.
    expect(readFileSync(new URL('./hover.ts', import.meta.url), 'utf8')).toContain('revealList');
  });
});

describe('the tables from other data', () => {
  function more(): WikiData {
    const base = loadWikiData();
    const first = base.creatures[0];
    if (first === undefined) throw new Error('no creature');
    base.creatures.push({
      ...first,
      id: 'brand-new',
      name: 'Brand "New"',
      line: 'brand-line',
      role: 'guard',
      knacks: ['k-new'],
      ownKnacks: ['k-new'],
      draftTalents: ['d-new'],
    });
    base.knacks.push({ id: 'k-new', name: 'Fresh <b>', family: 'Fresh', text: 'x', intent: 'x' });
    base.draftTalents.push({
      id: 'd-new',
      name: 'Fresh Talent',
      text: 'x',
      intent: 'x',
      roles: ['setter'],
    });
    base.draftPools.push({ line: 'brand-line', talents: ['d-new'] });
    return base;
  }

  it('shows a new creature, talent and Knack with no code change, and escapes their names', () => {
    const page = buildWiki(more());
    const talents = tableOf(page, 'draft-talents');
    const knacks = tableOf(page, 'knacks');
    expect(headers(talents).forms.at(-1)).toBe('creature-brand-new');
    expect(headers(talents).lines.at(-1)).toBe('line-brand-line');
    expect(headers(knacks).forms.at(-1)).toBe('creature-brand-new');
    const talentRow = rowsOf(talents).find((r) => r.target === 'dtalent-d-new');
    // In the pool, but a setter talent on a guard: idle, and at the start of its line.
    expect(talentRow?.cells.at(-1)).toBe('idle');
    expect(talentRow?.starts.at(-1)).toBe(talentRow ? talentRow.cells.length - 1 : -1);
    expect(talentRow?.cells.slice(0, -1).every((c) => c === '')).toBe(true);
    const knackRow = rowsOf(knacks).find((r) => r.target === 'knack-k-new');
    expect(knackRow?.cells.at(-1)).toBe('own');
    // A family with no entry is plain text, and nothing from the data gets through as markup.
    expect(knacks).toContain('Fresh');
    expect(knacks).not.toContain('<b>');
    expect(knacks).toContain('Fresh &lt;b&gt;');
    expect(talents).toContain('Brand &quot;New&quot;');
    const ids = idsOf(page);
    expect(ids.filter((x, i) => ids.indexOf(x) !== i)).toEqual([]);
  });

  it('keeps a Knack that a form kept as hollow, and a creature without art as a visible name', () => {
    const data2 = more();
    const last = data2.creatures.at(-1);
    if (last === undefined) throw new Error('no creature');
    last.ownKnacks = [];
    const page = buildWiki(data2);
    const row = rowsOf(tableOf(page, 'knacks')).find((r) => r.target === 'knack-k-new');
    expect(row?.cells.at(-1)).toBe('kept');
    expect(tableOf(page, 'knacks')).toContain(
      '<span class="fallback">Brand &quot;New&quot;</span>',
    );
  });
});
