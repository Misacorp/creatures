/**
 * SAMPLE data of the bonfire and the School scenes (prototype, dev only): nothing here comes from the economy
 * lab or the server. The friends who are online, the hearth project's size and state, the Acorns in hand, the
 * small moments and the tiny pictures (a stone, a flame) are made up so the scenes have something to show.
 */
import { content } from '@creatures/game';
import type { Creature } from '../../api';
import { creatureName } from '../../game';
import type { SpriteDef } from '../../sprites/sprite-data';
import { realNickname } from '../welcome/welcome-world';
import type { Hearth } from './bonfire-logic';

/** SAMPLE: the median of the active players' top-three levels on the server (the catch-up target's floor). */
export const SERVER_MIDDLE_LEVEL = 12;

/** SAMPLE: the hearth's first project (V-COM-15: small, finished within a few days), part way up. */
export const SAMPLE_HEARTH: Hearth = { total: 12, placed: 7, yours: 3, stoneCost: 10 };

/** SAMPLE: the Acorns the player holds. */
export const SAMPLE_ACORNS = 40;

/** The Acorns one gift is (a stone's worth). */
export const GIFT_STONES = 1;

/** SAMPLE: players online now with one creature each by the fire (alphabetical, never ranked). */
export const SAMPLE_FRIENDS: readonly { owner: string; species: string }[] = (() => {
  const species = content.creatures.filter((c) => !c.festival);
  const owners = ['Aino', 'Sade'];
  return owners.map((owner, i) => ({
    owner,
    species: species[(i * 7 + 2) % species.length]?.id ?? 'splashet',
  }));
})();

/** SAMPLE: what a small moment is (V-BON-9), as the picture between the pair and the words a screen reader hears. */
export const SAMPLE_MOMENTS: readonly { glyph: string; says: (a: string, b: string) => string }[] =
  [
    { glyph: 'gift', says: (a, b) => `${a} shared a find with ${b}` },
    { glyph: 'journal', says: (a, b) => `${a} found a lore page and showed ${b}` },
    { glyph: 'sparkle', says: (a, b) => `${a} and ${b} chased a spark` },
  ];

/** The name a creature of the sample roster shows: a "Buddy N" placeholder becomes a real name. */
export function sampleName(creature: Creature, index: number): string {
  const nick = realNickname(creature.nickname, index);
  return nick ?? creatureName(creature);
}

const INK = '#0d0a1a';

/** A hearth stone laid (7 x 5 pixels). */
export const STONE_UP: SpriteDef = {
  rows: ['..kkk..', '.kaaak.', 'kaaaadk', 'kaddddk', '.kkkkk.'],
  palette: { k: INK, a: '#b4b0c4', d: '#7c7894' },
};

/** A stone still to come: only its outline, in ink (a state shown by shape, not by colour alone). */
export const STONE_TO_COME: SpriteDef = {
  rows: ['..kkk..', '.k...k.', 'k.....k', 'k.....k', '.kkkkk.'],
  palette: { k: INK },
};

/** A stone you laid: gold with a bright centre, so it differs in colour and shape from the others'. */
export const STONE_YOURS: SpriteDef = {
  rows: ['..kkk..', '.kggdk.', 'kgggcdk', 'kgddddk', '.kkkkk.'],
  palette: { k: INK, g: '#ffd25a', d: '#c8952b', c: '#fff6cf' },
};

/** The small flame over a creature that is warming up (5 x 7 pixels). */
export const WARMING_FLAME: SpriteDef = {
  rows: ['..o..', '..oo.', '.ooyo', '.oyyo', 'oyyyo', 'oyyyo', '.ooo.'],
  palette: { o: '#ff7a2e', y: '#ffd25a' },
};
