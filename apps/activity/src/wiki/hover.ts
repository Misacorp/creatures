/**
 * The wiki's hover cards. This file is compiled and written as `wiki.js` next to the page by the
 * plugin; it has no imports and holds no game data. The page pre-renders the card of every entry as
 * a `<template id="tip-<anchor>">`; on hover (or keyboard focus) of a link to `#<anchor>` this clones
 * that template's content into one floating card near the link. Nothing is built from strings: the
 * card is filled with `cloneNode`, never HTML text. The card ignores the pointer, so it never blocks
 * a click on the link; a tap on a phone still just follows the link. The one other job: a link to an entry in
 * the list view of a section whose table view is showing switches the section to its list (`revealList`).
 * The other: the table of contents follows the reader (`trackContents`): the entry of the section on screen
 * gets `aria-current="location"`, and the contents scroll to keep it in view. It is only an aid; the contents
 * are plain links without this script.
 * The last: the modifier library's search box and filters (`setupModifiers`). The table's rows carry what is
 * filtered on as data attributes (see `modifiers.ts`), the controls are written `hidden`, and this script
 * reveals them and hides the rows that do not match; without it the whole table shows.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CardPlace {
  left: number;
  top: number;
  /** The card sits above the link (there was not room below). */
  above: boolean;
}

/** The id of the template that holds the card of a link's target, or null for any other link. */
export function previewIdFor(href: string | null): string | null {
  if (href === null || !/^#[a-z0-9-]+$/.test(href)) return null;
  return `tip-${href.slice(1)}`;
}

/**
 * Where to put a card of `card` size for a link at `link`, in a window of `view` size: below the link,
 * or above it when there is not room below and more room above; kept inside the window with `margin`
 * to spare (the card is never wider than the window minus the margins; CSS caps it).
 */
export function placeCard(
  link: Box,
  card: { width: number; height: number },
  view: { width: number; height: number },
  gap = 6,
  margin = 8,
): CardPlace {
  const below = view.height - (link.top + link.height) - gap - margin;
  const above = link.top - gap - margin;
  const flip = card.height > below && above > below;
  const rawTop = flip ? link.top - gap - card.height : link.top + link.height + gap;
  const top = Math.max(margin, Math.min(rawTop, view.height - card.height - margin));
  const maxLeft = Math.max(margin, view.width - card.width - margin);
  const left = Math.max(margin, Math.min(link.left, maxLeft));
  return { left, top, above: flip };
}

/** A section's place: its id and the top of it in the window (as `getBoundingClientRect` gives it). */
export interface Mark {
  id: string;
  top: number;
}

/**
 * The section the reader is in: the last one, in page order, whose top has reached `line` (a distance from
 * the top of the window). Null before the first section starts. At the very end of the page (`atEnd`) it is
 * the last section, even when that one is too short to ever reach the line.
 */
export function currentSection(
  marks: readonly Mark[],
  line: number,
  atEnd: boolean,
): string | null {
  if (marks.length === 0) return null;
  if (atEnd) return marks[marks.length - 1]?.id ?? null;
  let found: string | null = null;
  for (const m of marks) {
    if (m.top <= line) found = m.id;
    else break;
  }
  return found;
}

/**
 * How far to scroll a scrolling box (by adding this to its `scrollTop`) so an item is fully inside it, with
 * `margin` to spare; 0 when it already is. Item and box are in the same coordinates (the window's).
 */
export function scrollDelta(
  item: { top: number; height: number },
  box: { top: number; height: number },
  margin = 8,
): number {
  const over = item.top - (box.top + margin);
  if (over < 0) return over;
  const under = item.top + item.height - (box.top + box.height - margin);
  return under > 0 ? Math.min(under, over) : 0;
}

/** What a table row of the modifier library carries as data attributes (`data-category`, `data-roles`, ...). */
export interface RowFacts {
  category: string;
  /** The roles it works for, separated by spaces. */
  roles: string;
  status: string;
  /** The lower-case text the search looks in. */
  text: string;
}

/** The search and the three filters; an empty choice lets everything through. */
export interface ModifierQuery {
  search: string;
  category: string;
  role: string;
  status: string;
}

/**
 * Whether a row shows for the current search and filters: every word of the search is in the row's text
 * (any case), its category and status are the chosen ones, and the chosen role is one it works for.
 */
export function rowMatches(row: RowFacts, query: ModifierQuery): boolean {
  if (query.category !== '' && row.category !== query.category) return false;
  if (query.status !== '' && row.status !== query.status) return false;
  if (query.role !== '' && !row.roles.split(' ').includes(query.role)) return false;
  const words = query.search
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '');
  return words.every((w) => row.text.includes(w));
}

/** "24 / 130". */
export function countText(shown: number, total: number): string {
  return `${String(shown)} / ${String(total)}`;
}

const FILTERS = ['category', 'role', 'status'] as const;

/**
 * The modifier library's search and filters: reveal the controls, and on every change hide the rows that do
 * not match and update the count. A link to a row that is hidden clears the search and filters first, so the
 * row can be seen (`showAll`, returns whether it changed anything).
 */
function setupModifiers(): { showAll: (id: string) => boolean } | null {
  const section = document.getElementById('modifiers');
  if (section === null) return null;
  const controls = section.querySelector('.mod-controls');
  const input = document.getElementById('mod-search');
  if (!(controls instanceof HTMLElement) || !(input instanceof HTMLInputElement)) return null;
  const rows = [...section.querySelectorAll<HTMLTableRowElement>('tbody > tr[data-category]')];
  const count = document.getElementById('mod-count');
  const empty = section.querySelector<HTMLElement>('.mod-empty');
  const groups = new Map<string, HTMLElement>();
  for (const name of FILTERS) {
    const group = controls.querySelector<HTMLElement>(`[data-filter="${name}"]`);
    if (group !== null) groups.set(name, group);
  }
  const chosen = (name: string): string =>
    groups.get(name)?.querySelector('button[aria-pressed="true"]')?.getAttribute('data-value') ??
    '';

  const apply = (): void => {
    const query: ModifierQuery = {
      search: input.value,
      category: chosen('category'),
      role: chosen('role'),
      status: chosen('status'),
    };
    let shown = 0;
    for (const row of rows) {
      const show = rowMatches(
        {
          category: row.dataset['category'] ?? '',
          roles: row.dataset['roles'] ?? '',
          status: row.dataset['status'] ?? '',
          text: row.dataset['text'] ?? '',
        },
        query,
      );
      row.hidden = !show;
      if (show) shown += 1;
    }
    if (count !== null) count.textContent = countText(shown, rows.length);
    if (empty !== null) empty.hidden = shown > 0;
  };

  const choose = (group: HTMLElement, value: string): void => {
    for (const b of group.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', b.getAttribute('data-value') === value ? 'true' : 'false');
      b.classList.toggle('on', b.getAttribute('data-value') === value);
    }
  };
  for (const group of groups.values()) {
    group.addEventListener('click', (e) => {
      const button = e.target instanceof Element ? e.target.closest('button') : null;
      if (button === null || !group.contains(button)) return;
      choose(group, button.getAttribute('data-value') ?? '');
      apply();
    });
  }
  input.addEventListener('input', apply);
  controls.hidden = false;
  apply();

  return {
    showAll: (id) => {
      const row = rows.find((r) => r.id === id);
      if (row === undefined || !row.hidden) return false;
      input.value = '';
      for (const group of groups.values()) choose(group, '');
      apply();
      return true;
    },
  };
}

const CARD_ID = 'wiki-card';

/** The card of the page, made on first use. */
function cardElement(): HTMLElement {
  const existing = document.getElementById(CARD_ID);
  if (existing !== null) return existing;
  const card = document.createElement('div');
  card.id = CARD_ID;
  card.className = 'pv-card';
  card.setAttribute('role', 'tooltip');
  card.hidden = true;
  document.body.append(card);
  return card;
}

/** The link (to an entry with a card) that an event's target is, or inside, if any. */
function linkOf(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const link = target.closest('a');
  if (link === null || link.classList.contains('self') || link.classList.contains('to-top'))
    return null;
  return previewIdFor(link.getAttribute('href')) === null ? null : link;
}

/**
 * A link to an entry in the list view of a section whose table view is showing: switch the section to its
 * list (check its radio), so the entry can be seen. The toggle itself needs no script; this only keeps a
 * link from landing on something hidden. Returns whether it switched anything.
 */
function revealList(id: string): boolean {
  const list = document.getElementById(id)?.closest('.view-list');
  const radio = list?.parentElement?.querySelector(':scope > input.r-list');
  if (!(radio instanceof HTMLInputElement) || radio.checked) return false;
  radio.checked = true;
  return true;
}

/** The id a `#fragment` names, or null. */
function fragmentId(hash: string | null): string | null {
  if (hash === null || !/^#[A-Za-z0-9_-]+$/.test(hash)) return null;
  return hash.slice(1);
}

/** The table of contents follows the reader: see the file's header. */
function trackContents(): void {
  const nav = document.querySelector('nav.toc');
  if (nav === null) return;
  const items = [...nav.querySelectorAll('a[href^="#"]')].flatMap((link) => {
    const id = fragmentId(link.getAttribute('href'));
    const target = id === null ? null : document.getElementById(id);
    if (id === null || target === null) return [];
    const parent = link.closest('ol.toc-lines')?.closest('li')?.querySelector(':scope > a') ?? null;
    return [{ link, id, target, parent }];
  });
  let shown: string | null = null;

  const update = (): void => {
    const root = document.documentElement;
    const id = currentSection(
      items.map((i) => ({ id: i.id, top: i.target.getBoundingClientRect().top })),
      Math.round(root.clientHeight * 0.25),
      window.scrollY + root.clientHeight >= root.scrollHeight - 2,
    );
    if (id === shown) return;
    shown = id;
    let active: Element | null = null;
    for (const i of items) {
      const here = i.id === id;
      if (here) {
        i.link.setAttribute('aria-current', 'location');
        active = i.link;
      } else i.link.removeAttribute('aria-current');
      i.link.classList.toggle('in-section', false);
    }
    // A creature line is inside the Creatures section: that entry is marked too (not as the current one).
    items.find((i) => i.id === id)?.parent?.classList.add('in-section');
    if (active === null || nav.scrollHeight <= nav.clientHeight) return;
    const item = active.getBoundingClientRect();
    const box = nav.getBoundingClientRect();
    nav.scrollTop += scrollDelta(item, box);
  };

  let queued = false;
  const later = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  };
  window.addEventListener('scroll', later, { passive: true });
  window.addEventListener('resize', later);
  window.addEventListener('load', later);
  update();
}

function start(): void {
  trackContents();
  const modifiers = setupModifiers();
  let shown: HTMLAnchorElement | null = null;

  const hide = (): void => {
    if (shown === null) return;
    shown.removeAttribute('aria-describedby');
    shown = null;
    const card = document.getElementById(CARD_ID);
    if (card !== null) {
      card.hidden = true;
      card.replaceChildren();
    }
  };

  const show = (link: HTMLAnchorElement): void => {
    const id = previewIdFor(link.getAttribute('href'));
    const template = id === null ? null : document.getElementById(id);
    if (!(template instanceof HTMLTemplateElement)) return;
    hide();
    const card = cardElement();
    card.replaceChildren(template.content.cloneNode(true));
    card.hidden = false;
    const rect = link.getClientRects()[0] ?? link.getBoundingClientRect();
    const size = card.getBoundingClientRect();
    const at = placeCard(
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      { width: size.width, height: size.height },
      {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
    );
    card.style.left = `${String(at.left)}px`;
    card.style.top = `${String(at.top)}px`;
    link.setAttribute('aria-describedby', CARD_ID);
    shown = link;
  };

  // A mouse or pen hovering. Touch is left alone: a tap follows the link, with no card first.
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const link = linkOf(e.target);
    if (link !== null && link !== shown) show(link);
  });
  document.addEventListener('pointerout', (e) => {
    if (shown === null) return;
    const to = e.relatedTarget;
    if (to instanceof Node && shown.contains(to)) return;
    if (linkOf(e.target) === shown) hide();
  });
  // The keyboard: only focus that shows a focus ring, so a tap's focus does not open a card.
  document.addEventListener('focusin', (e) => {
    const link = linkOf(e.target);
    if (link !== null && link.matches(':focus-visible')) show(link);
  });
  document.addEventListener('focusout', (e) => {
    if (linkOf(e.target) === shown) hide();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  // Following a link, going back, or opening an address with a fragment: show the list when the entry is in it.
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    const id = fragmentId(e.target.closest('a')?.getAttribute('href') ?? null);
    if (id !== null) {
      revealList(id);
      // A row the filters hide would be a dead jump: clear them first (the browser then scrolls to it).
      if (modifiers?.showAll(id) === true) document.getElementById(id)?.scrollIntoView();
    }
  });
  const jump = (): void => {
    const id = fragmentId(window.location.hash);
    if (id === null) return;
    const listed = revealList(id);
    const cleared = modifiers?.showAll(id) === true;
    if (listed || cleared) document.getElementById(id)?.scrollIntoView();
  };
  window.addEventListener('hashchange', jump);
  jump();
  window.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('blur', hide);
}

// Run in a page; a test imports the pure functions above where there is no `document`.
if (typeof document !== 'undefined') start();
