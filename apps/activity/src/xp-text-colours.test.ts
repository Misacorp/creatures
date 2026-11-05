import { describe, expect, it } from 'vitest';
import xpGain from './styles/components/xp-gain.css?raw';
import tokens from './styles/base/tokens.css?raw';

/**
 * The numbers on an XP bar ("450 / 450") sit on any fill, a full gold bar included, in every look. They are bone
 * with an ink edge written out as colours, not read from the tokens, so a look that recolours `--bone` or `--ink`
 * cannot make them pale on a pale bar.
 */
describe('the numbers on an XP bar', () => {
  const rule = /\n\.xp-text \{([^}]*)\}/.exec(xpGain)?.[1] ?? '';

  it('have a rule', () => {
    expect(rule).not.toBe('');
  });

  it('use no token for their colour or edge', () => {
    expect(rule).not.toMatch(/var\(--(bone|ink)\)/);
  });

  it("are the tokens' own values: bone text, ink edge", () => {
    const bone = /--bone:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1] ?? 'missing';
    const ink = /--ink:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1] ?? 'missing';
    expect(rule).toContain(`color: ${bone};`);
    expect(rule).toContain(`1px 0 ${ink}`);
  });
});
