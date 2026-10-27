import { describe, expect, it } from 'vitest';
import { SPECIES_SPRITE_DATA } from '../sprites/data/species-sprites';
import { artPath, spriteSvg } from './art';

describe('the wiki creature pictures', () => {
  it('draws a sprite as crisp pixel runs in its palette colours', () => {
    const svg = spriteSvg({ rows: ['a.b', 'aab'], palette: { a: '#112233', b: '#fff' } });
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2" width="3" height="2" shape-rendering="crispEdges">' +
        '<path fill="#112233" d="M0 0h1v1h-1zM0 1h2v1h-2z"/><path fill="#fff" d="M2 0h1v1h-1zM2 1h1v1h-1z"/></svg>\n',
    );
  });

  it('mirrors a half sprite', () => {
    const svg = spriteSvg({ mirror: true, rows: ['.a'], palette: { a: '#000000' } });
    expect(svg).toContain('viewBox="0 0 4 1"');
    expect(svg).toContain('d="M1 0h2v1h-2z"');
  });

  it('refuses a palette that is not a hex colour', () => {
    expect(() => spriteSvg({ rows: ['a'], palette: { a: 'red" onload="x' } })).toThrow();
  });

  it('draws every species sprite, with no script or style', () => {
    for (const [id, def] of Object.entries(SPECIES_SPRITE_DATA)) {
      const svg = spriteSvg(def);
      expect(svg, id).toMatch(/^<svg [^>]*><path /);
      expect(svg, id).not.toMatch(/<script|<style|\son[a-z]+=|href=/i);
    }
  });

  it('serves a picture from a lower-case path of the site', () => {
    expect(artPath('Splashet')).toBe('/wiki-art/creature-splashet.svg');
    expect(artPath('../../x"y')).toBe('/wiki-art/creature-x-y.svg');
    expect(artPath('***')).toBe('/wiki-art/creature-x.svg');
  });
});
