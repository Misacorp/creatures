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
