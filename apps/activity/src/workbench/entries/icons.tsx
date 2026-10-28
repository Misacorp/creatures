import { ItemSprite } from '../../GearArt';
import { shinyPalette } from '../../art';
import { Sprite } from '../../sprites/Sprite';
import { ArmchairIcon } from '../../ui/ArmchairIcon';
import { GameIcon } from '../../ui/GameIcon';
import { PixelTriangle } from '../../ui/PixelTriangle';
import { GEAR_BASE_IDS, ICON_NAMES, SPRITES, SPRITE_NAMES, iconOf } from '../data';
import { bool, num, str } from '../props';
import type { Entry } from '../types';

const gameIcon: Entry = {
  name: 'GameIcon',
  file: 'apps/activity/src/ui/GameIcon.tsx',
  group: 'Icons',
  description:
    'One little picture at one fixed size, whatever it is (a glyph, a supply, a gear part, an item or an element); every cost line and badge draws its icon through it.',
  controls: {
    icon: { kind: 'select', options: ICON_NAMES },
    scale: { kind: 'number', min: 1, max: 12 },
  },
  defaults: { icon: 'glyph: gem', scale: 6 },
  presets: [
    { name: 'Glyph', props: { icon: 'glyph: gem' } },
    { name: 'Gear part', props: { icon: 'part: ember-shard' } },
    { name: 'Gear item', props: { icon: 'gear: kelp-cap', scale: 4 } },
    { name: 'Element', props: { icon: 'element: grove' } },
    { name: 'Unknown (fallback)', props: { icon: 'glyph: unknown (the fallback)' } },
    { name: 'Small (as in a badge)', props: { scale: 2 } },
  ],
  render: (p) => <GameIcon icon={iconOf(str(p, 'icon'))} scale={num(p, 'scale')} />,
};

const sprite: Entry = {
  name: 'Sprite',
  file: 'apps/activity/src/sprites/Sprite.tsx',
  group: 'Icons',
  description:
    'Draws pixel art (a creature, a boss or a destination banner) at a whole-number scale with sharp edges; every picture in the game is one of these.',
  controls: {
    sprite: { kind: 'select', options: SPRITE_NAMES },
    scale: { kind: 'number', min: 1, max: 12 },
    shiny: { kind: 'toggle' },
    bob: { kind: 'toggle' },
  },
  defaults: { sprite: 'creature: cindle', scale: 6, shiny: false, bob: false },
  presets: [
    { name: 'Creature', props: {} },
    { name: 'Shiny creature', props: { shiny: true } },
    { name: 'Idle bob', props: { bob: true } },
    { name: 'Boss', props: { sprite: 'boss: storm-sovereign', scale: 4 } },
    { name: 'Banner', props: { sprite: 'banner: tidepools', scale: 3 } },
    { name: 'Tiny (scale 1)', props: { scale: 1 } },
  ],
  render: (p) => {
    const name = str(p, 'sprite');
    const def = SPRITES[name];
    if (def === undefined) return <p class="muted">No such sprite.</p>;
    const species = name.startsWith('creature: ') ? name.slice('creature: '.length) : '';
    const palette = bool(p, 'shiny') && species !== '' ? shinyPalette(species) : undefined;
    return (
      <Sprite
        sprite={def}
        scale={num(p, 'scale')}
        bob={bool(p, 'bob')}
        alt={name}
        {...(palette === undefined ? {} : { palette })}
      />
    );
  },
};

const itemSprite: Entry = {
  name: 'ItemSprite',
  file: 'apps/activity/src/GearArt.tsx',
  group: 'Icons',
  description:
    "A gear item's pixel picture (12 by 12), tinted by its element; it is on item cards, the bag and loot reveals.",
  controls: {
    base: { kind: 'select', options: GEAR_BASE_IDS },
    scale: { kind: 'number', min: 1, max: 12 },
  },
  defaults: { base: 'tidepool-charm', scale: 6 },
  presets: [
    { name: 'Hat', props: { base: 'kelp-cap' } },
    { name: 'Scarf', props: { base: 'ember-muffler' } },
    { name: 'Charm', props: { base: 'tidepool-charm' } },
  ],
  render: (p) => (
    <ItemSprite baseId={str(p, 'base')} scale={num(p, 'scale')} alt={str(p, 'base')} />
  ),
};

const armchairIcon: Entry = {
  name: 'ArmchairIcon',
  file: 'apps/activity/src/ui/ArmchairIcon.tsx',
  group: 'Icons',
  description:
    'A small pixel armchair in the text colour that marks the lounge: it is before the Lounge button on the creature page and the Lounging badge on cards.',
  controls: { label: { kind: 'select', options: ['Lounge', 'Lounging'] } },
  defaults: { label: 'Lounge' },
  presets: [
    { name: 'Lounge button', props: { label: 'Lounge' } },
    { name: 'Lounging badge', props: { label: 'Lounging' } },
  ],
  render: (p) =>
    str(p, 'label') === 'Lounge' ? (
      <button type="button" class="lounge-button">
        <ArmchairIcon /> Lounge
      </button>
    ) : (
      <span class="badge good">
        <ArmchairIcon />
        Lounging
      </span>
    ),
};

const pixelTriangle: Entry = {
  name: 'PixelTriangle',
  file: 'apps/activity/src/ui/PixelTriangle.tsx',
  group: 'Icons',
  description:
    'The game\'s one small pixel triangle, in the text colour: small (8 by 5 px) marks the sorted column of a table, medium (14 by 8 px) the "Equip on" button. Use it for any small marker; never draw another.',
  controls: { size: { kind: 'select', options: ['small', 'medium'] } },
  defaults: { size: 'small' },
  presets: [
    { name: 'Small (a sorted column)', props: { size: 'small' } },
    { name: 'Medium (Equip on)', props: { size: 'medium' } },
  ],
  render: (p) => (
    <span class="pix">
      Damage <PixelTriangle size={str(p, 'size') === 'medium' ? 'medium' : 'small'} />
    </span>
  ),
};

export const iconEntries: readonly Entry[] = [
  gameIcon,
  sprite,
  itemSprite,
  armchairIcon,
  pixelTriangle,
];
