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
    if (id !== null) revealList(id);
  });
  const jump = (): void => {
    const id = fragmentId(window.location.hash);
    if (id !== null && revealList(id)) document.getElementById(id)?.scrollIntoView();
  };
  window.addEventListener('hashchange', jump);
  jump();
  window.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('blur', hide);
}

// Run in a page; a test imports the pure functions above where there is no `document`.
if (typeof document !== 'undefined') start();
