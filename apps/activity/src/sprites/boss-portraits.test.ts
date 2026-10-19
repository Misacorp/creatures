import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { BOSS_SPRITE_DATA } from './data/boss-sprites';

// The raid posts in Discord show the boss's portrait from the game's site (`/discord/bosses/<id>.png`),
// drawn from the boss sprites by `scripts/boss-portraits.mts` and committed under `public/`.
const portraits = Object.keys(import.meta.glob('../../public/discord/bosses/*.png')).map((path) =>
  path.replace(/^.*\/(.+)\.png$/, '$1'),
);

describe('the boss portraits for Discord', () => {
  it('has a portrait for every raid boss, and no other', () => {
    expect(portraits.sort()).toEqual(content.bosses.map((b) => b.id).sort());
  });

  it('is drawn from a sprite every boss has', () => {
    for (const boss of content.bosses) expect(BOSS_SPRITE_DATA[boss.id], boss.id).toBeDefined();
  });
});
