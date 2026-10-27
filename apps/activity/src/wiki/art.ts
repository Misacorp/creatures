/**
 * The creature pictures of the wiki: each form's pixel sprite as a small SVG file, served from the
 * site itself (the Content-Security-Policy allows images from `'self'`). Pure and with no I/O, so it
 * is unit tested; the plugin writes the files next to the page.
 */
import { expandRows, validateSprite, type SpriteDef } from '../sprites/sprite-data';

/** Where the picture of a creature form is served from. */
export function artPath(creatureId: string): string {
  const clean = creatureId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `/wiki-art/creature-${clean === '' ? 'x' : clean}.svg`;
}

/**
 * A sprite as an SVG: one path per colour, made of horizontal runs of pixels, drawn with sharp edges.
 * The palette is validated first (hex colours only), so nothing but numbers and colours reaches the
 * markup.
 */
export function spriteSvg(def: SpriteDef): string {
  validateSprite(def);
  const rows = expandRows(def);
  const width = rows[0]?.length ?? 0;
  const paths = new Map<string, string[]>();
  for (const [y, row] of rows.entries()) {
    let x = 0;
    while (x < width) {
      const ch = row.charAt(x);
      const colour = ch === '.' ? undefined : def.palette[ch];
      if (colour === undefined) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < width && row.charAt(end) === ch) end += 1;
      const runs = paths.get(colour) ?? [];
      runs.push(`M${String(x)} ${String(y)}h${String(end - x)}v1h-${String(end - x)}z`);
      paths.set(colour, runs);
      x = end;
    }
  }
  const body = [...paths.entries()]
    .map(([colour, runs]) => `<path fill="${colour}" d="${runs.join('')}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(rows.length)}" width="${String(width)}" height="${String(rows.length)}" shape-rendering="crispEdges">${body}</svg>\n`;
}
