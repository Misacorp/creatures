/**
 * The wiki's "Modifiers" section: the library of every effect that changes a creature (docs/design/combat/
 * modifiers.md), as one two-column table (the modifier with its chips | what it does), with a search box and
 * three filters (category, role, status) that `hover.ts` runs. Pure string building from `WikiData`, so new
 * content is a new row with no change here. Each row carries what the script filters on as data attributes
 * (`data-category`, `data-roles`, `data-status` and a lower-case `data-text` for the search); the controls are
 * written `hidden` and the script reveals them, so without a script the whole table shows and nothing
 * pretends to work. A row is an entry like any other: it has an anchor id and a hover card (`previews.ts`).
 */
import { anchor, capital, chip, chipClasses, esc, type Kind } from './html';
import type { WikiData, WikiModifier } from './types';

/** The categories as the page words them, in the order the table groups them. */
export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  damage: 'Damage',
  marks: 'Marks',
  protection: 'Protection',
  support: 'Support',
  outside: 'Outside',
};

/** What each category covers, shown under the filters. */
const CATEGORY_HINTS: Readonly<Record<string, string>> = {
  damage: 'hits harder, crits, reactions’ damage',
  marks: 'marks and reactions setup',
  protection: 'armour, dodge, HP, cover, intercept, survival, silence wards',
  support: 'heals, boosts, debuffs on the boss, cleanses',
  outside: 'trips, crafting, catches: not in a fight',
};

/** The statuses as the page words them. */
export const STATUS_LABELS: Readonly<Record<string, string>> = {
  game: 'In the game',
  lab: 'Lab draft',
  idea: 'Idea',
};

/** The class of the status chip, so each status has its own colour. */
function statusClass(status: string): string {
  return `mod-status ${anchor('s', status)}`;
}

export function categoryLabel(id: string): string {
  return CATEGORY_LABELS[id] ?? capital(id);
}

export function statusLabel(id: string): string {
  return STATUS_LABELS[id] ?? capital(id);
}

/** The roles of a modifier as words: all four is "Any role". */
function roleWords(
  m: WikiModifier,
  all: readonly string[],
  name: (id: string) => string,
): string[] {
  const every = all.length > 0 && all.every((r) => m.roles.includes(r));
  return every ? ['Any role'] : m.roles.map(name);
}

/**
 * The chips of a modifier, plain text (no links): category, kind, status, and the roles it works for as the
 * game's role chips. Used in the table and in the hover card.
 */
export function modifierChips(m: WikiModifier, data: Pick<WikiData, 'roles'>): string {
  const roleName = new Map(data.roles.map((r) => [r.id, r.name]));
  const roles = roleWords(
    m,
    data.roles.map((r) => r.id),
    (id) => roleName.get(id) ?? capital(id),
  ).map((text) => chip({ classes: chipClasses.role(), text }));
  return [
    `<span class="tag mod-cat">${esc(categoryLabel(m.category))}</span>`,
    `<span class="tag mod-kind">${esc(capital(m.kind))}</span>`,
    `<span class="tag ${esc(statusClass(m.status))}">${esc(statusLabel(m.status))}</span>`,
    ...roles,
  ].join('');
}

/** The lower-case text the search looks in: the name, what it does and the other names. */
export function searchText(m: WikiModifier): string {
  return [m.name, m.text, ...m.also].join(' ').toLowerCase();
}

/** What the section needs of the page: a link to an entry (plain text when it has none). */
export interface ModifierPage {
  link(kind: Kind, id: string, label: string): string;
}

function button(value: string, label: string, on: boolean): string {
  return `<button type="button" class="toggle${on ? ' on' : ''}" data-value="${esc(value)}" aria-pressed="${on ? 'true' : 'false'}">${esc(label)}</button>`;
}

/** One filter: its name and a row of exclusive choices (the first, which lets everything through, is chosen). */
function filter(
  group: string,
  title: string,
  all: string,
  options: readonly [string, string][],
): string {
  const buttons = [['', all] as const, ...options]
    .map(([value, label], i) => button(value, label, i === 0))
    .join('');
  return `<div class="mod-filter"><span class="label">${esc(title)}</span>
<div class="segmented" role="group" aria-label="${esc(title)}" data-filter="${esc(group)}">${buttons}</div></div>`;
}

/** The distinct values of a field in preferred order, then any other in data order. */
function ordered(values: readonly string[], preferred: readonly string[]): string[] {
  const present = new Set(values);
  return [
    ...preferred.filter((p) => present.has(p)),
    ...[...present].filter((v) => !preferred.includes(v)),
  ];
}

function row(page: ModifierPage, data: WikiData, m: WikiModifier): string {
  const id = anchor('modifier', m.id);
  const talents = data.draftTalents
    .filter((d) => m.draftTalents.includes(d.id))
    .map((d) => page.link('dtalent', d.id, d.name));
  const notes = [
    m.also.length === 0 ? '' : `Also called ${esc(m.also.join(', '))}.`,
    talents.length === 0 ? '' : `Also a draft talent: ${talents.join(', ')}.`,
  ].filter((n) => n !== '');
  const note = notes.length === 0 ? '' : `\n<p class="mod-note">${notes.join(' ')}</p>`;
  return `<tr id="${esc(id)}" data-category="${esc(m.category)}" data-roles="${esc(m.roles.join(' '))}" data-status="${esc(m.status)}" data-text="${esc(searchText(m))}">
<th scope="row" class="mod-name"><span class="mod-title">${esc(m.name)} <a class="self" href="#${esc(id)}" aria-label="Link to ${esc(m.name)}">#</a></span><span class="mod-tags">${modifierChips(m, data)}</span></th>
<td class="mod-text"><p>${esc(m.text)}</p>${note}</td>
</tr>`;
}

/** The whole section. */
export function modifiersSection(page: ModifierPage, data: WikiData): string {
  const mods = data.modifiers;
  const categories = ordered(
    mods.map((m) => m.category),
    Object.keys(CATEGORY_LABELS),
  );
  const statuses = ordered(
    mods.map((m) => m.status),
    Object.keys(STATUS_LABELS),
  );
  const roleName = new Map(data.roles.map((r) => [r.id, r.name]));
  const roles = ordered(
    mods.flatMap((m) => m.roles),
    data.roles.map((r) => r.id),
  );
  const total = String(mods.length);
  const hints = categories
    .map(
      (c) => `<li><strong>${esc(categoryLabel(c))}</strong>: ${esc(CATEGORY_HINTS[c] ?? '')}</li>`,
    )
    .join('');
  const controls = `<div class="mod-controls" hidden>
<p class="mod-search"><label class="label" for="mod-search">Search</label>
<input type="text" id="mod-search" autocomplete="off" maxlength="60" placeholder="Name or what it does"></p>
${filter(
  'category',
  'Category',
  'All',
  categories.map((c) => [c, categoryLabel(c)]),
)}
${filter(
  'role',
  'Works for',
  'Any',
  roles.map((r) => [r, roleName.get(r) ?? capital(r)]),
)}
${filter(
  'status',
  'Status',
  'All',
  statuses.map((s) => [s, statusLabel(s)]),
)}
<p class="mod-count" id="mod-count" role="status" aria-live="polite">${total} / ${total}</p>
</div>`;
  const rows = mods.map((m) => row(page, data, m)).join('\n');
  return `<section id="modifiers">
<h2>Modifiers <a class="self" href="#modifiers" aria-label="Link to Modifiers">#</a></h2>
<p>Everything that changes a creature in a fight or on a trip, one entry per effect and one name wherever it appears. <strong>In the game</strong> is a gear line shipped today (a talent in the game today is one too); <strong>Lab draft</strong> is an effect only a combat v2 draft talent has; <strong>Idea</strong> is in the design notes and built nowhere. A draft talent that is the same effect as another entry is listed on that entry.</p>
<ul class="index">${hints}</ul>
${controls}
<div class="mod-wrap">
<table class="mods" aria-label="Modifiers">
<thead><tr><th scope="col" class="mod-name">Modifier</th><th scope="col">What it does</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>
<p class="mod-empty" hidden>No modifier matches. Clear the search or a filter.</p>
</section>`;
}
