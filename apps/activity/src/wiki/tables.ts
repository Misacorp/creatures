/**
 * The table views of the wiki's two big combat v2 sections (draft talents, Knacks): one row per talent or
 * Knack, one column per creature form (in content order, a visible gap between lines), a mark where the form
 * has it. Pure string building from `WikiData`, so a new creature, talent or Knack is a new column or row
 * with no change here. A table holds only links to entries that exist elsewhere on the page (the list view
 * holds the entries and their ids) and no ids of its own, so it never duplicates an anchor. The two views of
 * a section sit under one radio toggle (`viewSwitch`) that works in CSS alone.
 */
import { anchor, capital, esc, type Kind } from './html';
import type { Imager } from './previews';
import type { WikiCreature, WikiData } from './types';

/** The size of a creature picture in a column header (the art's own scale, so it stays crisp). */
const PIC = 32;

/** What the tables need of the page: pictures, and a link to an entry (plain text if it has none). */
export interface TablePage extends Imager {
  link(kind: Kind, id: string, label: string): string;
}

/** The creatures grouped by line, in content order. */
export function groupLines(creatures: readonly WikiCreature[]): {
  line: string;
  forms: WikiCreature[];
}[] {
  const out: { line: string; forms: WikiCreature[] }[] = [];
  for (const c of creatures) {
    const group = out.find((g) => g.line === c.line);
    if (group === undefined) out.push({ line: c.line, forms: [c] });
    else group.forms.push(c);
  }
  return out;
}

/** "Splashet line": a line is named for its base form. */
export function lineName(forms: readonly WikiCreature[]): string {
  const first = forms.find((f) => f.stage === 1) ?? forms[0];
  return `${first?.name ?? 'Unknown'} line`;
}

/** A section's two views: the table (the default) and the list, with the toggle that switches them. */
export function viewSwitch(id: string, list: string, table: string): string {
  const name = `${id}-view`;
  return `<div class="views">
<input type="radio" class="view-radio r-list" name="${esc(name)}" id="${esc(name)}-list">
<input type="radio" class="view-radio r-table" name="${esc(name)}" id="${esc(name)}-table" checked>
<div class="segmented view-toggle" role="group" aria-label="View">
<label class="l-list" for="${esc(name)}-list">List</label>
<label class="l-table" for="${esc(name)}-table">Table</label>
</div>
<div class="view-list">
${list}
</div>
<div class="view-table">
${table}
</div>
</div>`;
}

/** A mark's shape (CSS draws it: a filled square, or a hollow one) and its words for assistive technology. */
interface Mark {
  /** The cell's class. */
  cell: string;
  hollow: boolean;
  words: string;
}

function mark(m: Mark, ls: boolean): string {
  const classes = `${m.cell}${ls ? ' ls' : ''}`;
  return `<td class="${classes}"><span class="mark${m.hollow ? ' alt' : ''}" aria-hidden="true"></span><span class="vh">${esc(m.words)}</span></td>`;
}

function blank(ls: boolean): string {
  return `<td${ls ? ' class="ls"' : ''}></td>`;
}

/** A picture link, with its name as visually hidden text (the picture itself has no alt); the name shows when there is no art. */
function pictureLink(target: string, picture: string, name: string): string {
  const inner = picture === '' ? `<span class="fallback">${esc(name)}</span>` : picture;
  const hidden = picture === '' ? '' : `<span class="vh">${esc(name)}</span>`;
  return `<a href="#${esc(target)}" class="pic">${inner}${hidden}</a>`;
}

/** The two header rows: a row of lines (the base picture over its forms), then a row of forms; `corner` names the rows. */
function head(page: TablePage, data: WikiData, corner: string): string {
  const groups = groupLines(data.creatures);
  const lineRow = groups
    .map((g) => {
      const name = lineName(g.forms);
      return `<th scope="colgroup" colspan="${String(g.forms.length)}" class="ls">${pictureLink(
        anchor('line', g.line),
        page.line(g.line, PIC),
        name,
      )}</th>`;
    })
    .join('');
  const formRow = groups
    .flatMap((g) =>
      g.forms.map(
        (f, i) =>
          `<th scope="col"${i === 0 ? ' class="ls"' : ''}>${pictureLink(
            anchor('creature', f.id),
            page.creature(f.id, PIC),
            f.name,
          )}</th>`,
      ),
    )
    .join('');
  return `<thead>
<tr class="lines"><th scope="col" rowspan="2" class="row-name corner">${esc(corner)}</th>${lineRow}</tr>
<tr class="forms">${formRow}</tr>
</thead>`;
}

/** The creature forms in column order: by line (a line's forms together), lines and forms in content order. */
function columnsOf(data: WikiData): WikiCreature[] {
  return groupLines(data.creatures).flatMap((g) => g.forms);
}

/** The ids of the forms whose column starts its line (the gap before it). */
function firsts(data: WikiData): Set<string> {
  return new Set(groupLines(data.creatures).flatMap((g) => g.forms.slice(0, 1).map((f) => f.id)));
}

function legend(items: readonly { hollow: boolean; text: string }[]): string {
  return `<ul class="legend">${items
    .map(
      (i) =>
        `<li><span class="mark${i.hollow ? ' alt' : ''}" aria-hidden="true"></span> ${esc(i.text)}</li>`,
    )
    .join('')}</ul>`;
}

function scroller(label: string, table: string): string {
  return `<div class="table-wrap" role="region" aria-label="${esc(label)}" tabindex="0">
${table}
</div>`;
}

/** The draft talents against the creature forms: in the form's line pool (filled) or in it but idle on its role (hollow). */
export function draftTalentsTable(page: TablePage, data: WikiData): string {
  const first = firsts(data);
  const forms = columnsOf(data);
  const rows = data.draftTalents
    .map((t) => {
      const cells = forms
        .map((c) => {
          const ls = first.has(c.id);
          if (!c.draftTalents.includes(t.id)) return blank(ls);
          return t.roles.includes(c.role)
            ? mark({ cell: 'on', hollow: false, words: 'In the pool' }, ls)
            : mark({ cell: 'idle', hollow: true, words: 'In the pool, idle on this form' }, ls);
        })
        .join('');
      return `<tr><th scope="row" class="row-name">${page.link('dtalent', t.id, t.name)}</th>${cells}</tr>`;
    })
    .join('\n');
  return `${legend([
    { hollow: false, text: "In the form's line pool and works for its role" },
    { hollow: true, text: 'In the pool but idle: the talent does nothing for the form’s role' },
  ])}
${scroller(
  'Draft talents by creature form (scrolls sideways)',
  `<table class="matrix" aria-label="Draft talents by creature form">
${head(page, data, 'Talent')}
<tbody>
${rows}
</tbody>
</table>`,
)}`;
}

/** The Knacks against the creature forms: brought by the form (filled) or kept from the form it evolved from (hollow), by family. */
export function knacksTable(page: TablePage, data: WikiData): string {
  const first = firsts(data);
  const forms = columnsOf(data);
  const columns = forms.length;
  const families: string[] = [];
  for (const k of data.knacks) if (!families.includes(k.family)) families.push(k.family);
  const body = families
    .map((family) => {
      const rows = data.knacks
        .filter((k) => k.family === family)
        .map((k) => {
          const cells = forms
            .map((c) => {
              const ls = first.has(c.id);
              if (!c.knacks.includes(k.id)) return blank(ls);
              return c.ownKnacks.includes(k.id)
                ? mark({ cell: 'own', hollow: false, words: 'Brings it' }, ls)
                : mark({ cell: 'kept', hollow: true, words: 'Keeps it from the form before' }, ls);
            })
            .join('');
          return `<tr><th scope="row" class="row-name">${page.link('knack', k.id, k.name)}</th>${cells}</tr>`;
        })
        .join('\n');
      return `<tbody>
<tr class="family-row"><th scope="rowgroup" class="row-name">${page.link('family', family, capital(family))}</th><td colspan="${String(columns)}"></td></tr>
${rows}
</tbody>`;
    })
    .join('\n');
  return `${legend([
    { hollow: false, text: 'Brings the Knack itself' },
    { hollow: true, text: 'Keeps the Knack from the form it evolved from' },
  ])}
${scroller(
  'Knacks by creature form (scrolls sideways)',
  `<table class="matrix" aria-label="Knacks by creature form">
${head(page, data, 'Knack')}
${body}
</table>`,
)}`;
}
