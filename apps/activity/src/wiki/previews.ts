/**
 * The hover cards of the wiki: for every entry a link can point to, a `<template>` holding the card's
 * content. The script (`hover.ts`) clones the template of a link's target into one floating card, so
 * all card text is generated here, escaped, from the data, and the script holds none of it. Previews
 * contain no links and no ids (only the template has one), and their images are not loaded until a
 * card is shown (a `<template>` is inert).
 */
import { anchor, capital, chip, chipClasses, esc, plain, previewId } from './html';
import type { WikiData, WikiCreature } from './types';

/** Draws a creature form's small picture (or nothing when it has no art). */
export interface Imager {
  creature(id: string, size: number): string;
  line(line: string, size: number): string;
  /** An element's icon, or nothing. */
  element(id: string, size: number): string;
}

const HEAD = 48;
const FORM = 32;
const ICON = 16;

/** The line's forms as columns by stage, arrows between them; `here` is drawn highlighted. */
function tree(img: Imager, forms: readonly WikiCreature[], here: string | null): string {
  const stages = [...new Set(forms.map((f) => f.stage))].sort((a, b) => a - b);
  const columns = stages.map((stage) => {
    const members = forms
      .filter((f) => f.stage === stage)
      .map(
        (f) =>
          `<span class="pv-form${f.id === here ? ' here' : ''}">${img.creature(f.id, FORM)}<span>${esc(f.name)}</span></span>`,
      )
      .join('');
    return `<span class="pv-stage">${members}</span>`;
  });
  return `<div class="pv-tree">${columns.join('<span class="pv-arrow" aria-hidden="true">&rarr;</span>')}</div>`;
}

/** `nameClass` is a game class that colours the name (a creature's or rarity's name is in its rarity colour). */
function card(title: string, kind: string, body: string, icon = '', nameClass = ''): string {
  const cls = nameClass === '' ? 'pv-name' : `pv-name rarity-name ${nameClass}`;
  return `<div class="pv-head">${icon}<span><strong class="${cls}">${esc(title)}</strong><span class="pv-kind">${esc(kind)}</span></span></div>${body}`;
}

/** The lines of a glossary entry as a list (nothing for none). */
function lineList(lines: readonly string[]): string {
  return lines.length === 0
    ? ''
    : `<ul class="pv-lines">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
}

/** The templates of every entry the page links to, one after another. */
export function buildPreviews(img: Imager, data: WikiData): string {
  const out: string[] = [];
  const add = (kind: string, id: string, content: string): void => {
    out.push(`<template id="${esc(previewId(anchor(kind, id)))}">${content}</template>`);
  };
  const elementName = new Map(data.elements.map((e) => [e.id, e.name]));
  const roleName = new Map(data.roles.map((r) => [r.id, r.name]));
  const draftName = new Map(data.draftTalents.map((t) => [t.id, t.name]));

  const groups = new Map<string, WikiCreature[]>();
  for (const c of data.creatures) groups.set(c.line, [...(groups.get(c.line) ?? []), c]);
  const baseOf = (forms: readonly WikiCreature[]): WikiCreature | undefined =>
    forms.find((f) => f.stage === 1) ?? forms[0];

  for (const c of data.creatures) {
    const forms = groups.get(c.line) ?? [c];
    const stages = new Set(forms.map((f) => f.stage)).size;
    // The tags are the game's own chips (the same as on the page), here plain: a card holds no links.
    const tags = `<p class="cc-tags pv-tags">${[
      chip({
        classes: chipClasses.element(c.element),
        text: elementName.get(c.element) ?? capital(c.element),
        icon: img.element(c.element, ICON),
      }),
      chip({ classes: chipClasses.role(), text: roleName.get(c.role) ?? capital(c.role) }),
      chip({ classes: chipClasses.rarity(c.rarity), text: capital(c.rarity) }),
    ].join('')}</p>`;
    add(
      'creature',
      c.id,
      card(
        c.name,
        `Stage ${String(c.stage)} / ${String(stages)}`,
        `${tags}${tree(img, forms, c.id)}`,
        img.creature(c.id, HEAD),
        anchor('rarity', c.rarity),
      ),
    );
  }
  for (const [line, forms] of groups) {
    const name = `${baseOf(forms)?.name ?? 'Unknown'} line`;
    const kind = `${String(forms.length)} form${forms.length === 1 ? '' : 's'}`;
    add('line', line, card(name, kind, tree(img, forms, null), img.line(line, HEAD)));
  }
  for (const p of data.draftPools) {
    const name = `${capital(p.line)} line`;
    const talents = p.talents.map((id) => draftName.get(id) ?? id).join(', ');
    add(
      'pool',
      p.line,
      card(
        name,
        'Draft talent pool',
        `<p class="pv-text">${esc(talents)}</p>`,
        img.line(p.line, HEAD),
      ),
    );
  }
  for (const t of data.currentTalents) {
    add(
      'talent',
      t.id,
      card(
        t.name,
        t.signature ? 'Talent, signature' : 'Talent',
        `<p class="pv-text"><strong>${esc(t.text)}</strong></p><p class="pv-text">${esc(t.about)}</p>`,
      ),
    );
  }
  for (const k of data.knacks) {
    add(
      'knack',
      k.id,
      card(
        k.name,
        `Knack, ${k.family} family (draft)`,
        `<p class="pv-text">${esc(plain(k.text))}</p>`,
      ),
    );
  }
  for (const t of data.draftTalents) {
    add(
      'dtalent',
      t.id,
      card(
        t.name,
        'Talent (draft)',
        `<p class="pv-text">${esc(plain(t.text))}</p><p class="pv-text"><span class="pv-label">Works for:</span> ${esc(t.roles.map(capital).join(', '))}</p>`,
      ),
    );
  }
  for (const k of data.keywords) {
    add(
      'keyword',
      k.name,
      card(k.name, 'Keyword (draft)', `<p class="pv-text">${esc(k.means)}</p>`),
    );
  }
  for (const f of data.families) {
    add(
      'family',
      f.name,
      card(f.name, 'Knack family (draft)', `<p class="pv-text">${esc(f.text)}</p>`),
    );
  }
  for (const e of data.elements) {
    const against = (strong: boolean): string =>
      data.elementChart
        .filter((p) => p.attacker === e.id && (strong ? p.bp > 10_000 : p.bp < 10_000))
        .map((p) => elementName.get(p.defender) ?? p.defender)
        .join(', ') || 'none';
    add(
      'element',
      e.id,
      card(
        e.name,
        'Element',
        `<p class="pv-text"><span class="pv-label">Harder against:</span> ${esc(against(true))}<br><span class="pv-label">Softer against:</span> ${esc(against(false))}</p>`,
      ),
    );
  }
  for (const r of data.roles) {
    add(
      'role',
      r.id,
      card(
        r.name,
        'Role',
        `<p class="pv-text"><strong>${esc(r.short)}</strong></p>${lineList(r.lines)}`,
        r.species === null ? '' : img.creature(r.species, HEAD),
      ),
    );
  }
  for (const r of data.rarities) {
    add(
      'rarity',
      r.id,
      card(
        r.name,
        'Rarity',
        `<p class="pv-text"><strong>${esc(r.short)}</strong></p>${lineList(r.lines)}`,
        '',
        anchor('rarity', r.id),
      ),
    );
  }
  return out.join('\n');
}
