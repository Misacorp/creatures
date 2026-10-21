import { describe, expect, it } from 'vitest';

const files = import.meta.glob<string>('./styles/components/xp-gain.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const css = Object.values(files)[0] ?? '';

describe('the XP recap note', () => {
  it('spans every column of the shared grid, so the bar keeps its full width', () => {
    expect(css).toMatch(/\.xp-note\s*\{[^}]*grid-column:\s*1 \/ -1/);
    expect(css).toMatch(/\.xp-note\s*\{[^}]*font-size:\s*var\(--fs-small\)/);
    // And inside the subgrid block too, with the head and the track.
    const sub = css.slice(css.indexOf('@supports'));
    expect(sub).toMatch(/\.xp-note\s*\{\s*grid-column:\s*1 \/ -1/);
  });
});
