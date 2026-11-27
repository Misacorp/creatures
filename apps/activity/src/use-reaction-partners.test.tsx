import { afterEach, describe, expect, it } from 'vitest';
import { content } from '@creatures/game';
import { createPage, type Page } from './test-dom';
import type { PartnerKit } from './reaction-partners';
import { useReactionPartners, type ReactionPartners } from './use-reaction-partners';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

const kitOf = (id: string, species: string): PartnerKit => {
  const s = content.creatures.find((c) => c.id === species);
  if (s === undefined) throw new Error(species);
  return { id, role: s.role, element: s.element };
};
const KITS = [kitOf('setter', 'splashet'), kitOf('spark', 'tempestray')];

describe('useReactionPartners', () => {
  it('forgets a hover when the highlight goes off, so a creature that left cannot leave it behind', () => {
    let now: ReactionPartners | null = null;
    function Probe({ off }: { off: boolean }) {
      now = useReactionPartners({ kits: KITS, pinned: null, off });
      return null;
    }
    page = createPage();
    page.draw(<Probe off={false} />);
    page.update(() => {
      now?.touch('setter');
    });
    expect((now as ReactionPartners | null)?.touched).toBe('setter');
    // A drag starts: nothing is lit.
    page.draw(<Probe off />);
    expect((now as ReactionPartners | null)?.touched).toBeNull();
    // The drag ends: the old hover does not come back.
    page.draw(<Probe off={false} />);
    expect((now as ReactionPartners | null)?.touched).toBeNull();
  });

  it('a pinned creature is touched while no pointer is on one', () => {
    let now: ReactionPartners | null = null;
    function Probe() {
      now = useReactionPartners({ kits: KITS, pinned: 'spark' });
      return null;
    }
    page = createPage();
    page.draw(<Probe />);
    expect((now as ReactionPartners | null)?.touched).toBe('spark');
  });
});
