/** Small HTML helpers shared by the wiki's generator modules. Pure. */

/** HTML-escapes text for element content and for double- or single-quoted attribute values. */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** What the page can link to, by kind and content id. */
export type Kind =
  | 'creature'
  | 'line'
  | 'talent'
  | 'knack'
  | 'dtalent'
  | 'keyword'
  | 'family'
  | 'element'
  | 'pool'
  | 'role'
  | 'rarity';

/** An anchor id: a kind prefix and the content id, lower case, only `a-z`, `0-9` and `-`. */
export function anchor(kind: string, id: string): string {
  const clean = id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${kind}-${clean === '' ? 'x' : clean}`;
}

/** The `{Keyword}` markers of a text. */
export function keywordsIn(text: string): string[] {
  return [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '');
}

/** A text with its `{Keyword}` markers shown as plain words (the braces dropped). */
export function plain(text: string): string {
  return text.replace(/\{([^}]+)\}/g, '$1');
}

export function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The id of the `<template>` that holds the hover card of the entry with this anchor id. */
export function previewId(target: string): string {
  return `tip-${target}`;
}

/**
 * One of the game's chips (the element, role and rarity tags): a link to the entry's anchor when `href` is
 * given, else the same look as plain text (hover cards). `classes` are the game's own class names, made by
 * the callers from `anchor` (so only `a-z`, `0-9` and `-`); `icon` is ready markup (a picture) or nothing.
 */
export function chip(o: { classes: string; text: string; icon?: string; href?: string }): string {
  const inner = `${o.icon ?? ''}<span class="chip-text">${esc(o.text)}</span>`;
  if (o.href === undefined) return `<span class="chip ${o.classes}">${inner}</span>`;
  return `<a href="${esc(o.href)}" class="gtag-chip chip ${o.classes}">${inner}</a>`;
}

/** The game's class names of an element, role and rarity chip. */
export const chipClasses = {
  element: (id: string): string => anchor('t', id),
  role: (): string => 'role-chip',
  rarity: (id: string): string => `rarity-tag ${anchor('rarity', id)}`,
};
