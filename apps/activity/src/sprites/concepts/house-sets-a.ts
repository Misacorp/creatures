/**
 * Player housing, furniture sets A (concept wrapper; the art itself is in `../data/house/<set>.ts`, which the
 * house scene reads). Four sets of nine pieces, a wallpaper, a floor and a keepsake: Tidepool, Moonlit,
 * Emberhold and Rootwood (`docs/design/housing.md` 2.5 and 5). Nothing in the game imports this folder; the
 * wrapper exists so the studio can draw, lint and catalogue the packs and Misa can like or redo them.
 * Delete it when Misa likes a pack (the studio's "promote" step).
 */
import type { SpriteDef } from '../sprite-data';
import { HOUSE_ART as EMBERHOLD } from '../data/house/emberhold';
import { HOUSE_ART as MOONLIT } from '../data/house/moonlit';
import { HOUSE_ART as ROOTWOOD } from '../data/house/rootwood';
import { HOUSE_ART as TIDEPOOL } from '../data/house/tidepool';
import type { Concept, ConceptSet } from './index';

interface Pack {
  pieces?: Record<string, { sprite: SpriteDef; front?: SpriteDef; glow?: SpriteDef }>;
  skins?: Record<string, { tile: SpriteDef }>;
  keepsakes?: Record<string, SpriteDef>;
}

const FORM_NOTES: Readonly<Record<string, string>> = {
  bed: 'Bed, 48x26: a sleep anchor; the blanket is its own front layer.',
  cupboard: 'Cupboard, 30x36, floor-large.',
  table: 'Table, 44x18, floor-large.',
  shelf: 'Wall shelf, 40x20, wall-large, with a few things on it.',
  stool: 'Stool, 16x12, floor-small.',
  lamp: 'Ceiling lamp, 20x16, hangs from the top row; it has a night glow.',
  rug: 'Rug, 56x10, lies on the floor line.',
  frame: 'Picture frame, 24x16, wall-small.',
  curtains: 'Window with its dressing, 36x26, window spot.',
};

/** One concept set from a pack: every sprite of it, with a line on what it is. */
function setOf(
  id: string,
  title: string,
  pack: Pack,
  silhouette: string,
  ground: SpriteDef,
): ConceptSet {
  const sprites: Record<string, Concept> = {};
  for (const [pieceId, art] of Object.entries(pack.pieces ?? {})) {
    const form = pieceId.slice(pieceId.indexOf('-') + 1);
    sprites[form] = {
      kind: 'free',
      note: `${FORM_NOTES[form] ?? form} ${silhouette}`,
      sprite: art.sprite,
    };
    if (art.front)
      sprites[`${form}-front`] = {
        kind: 'free',
        note: 'The bed’s blanket, drawn over the sleeping housemate.',
        sprite: art.front,
      };
    if (art.glow)
      sprites[`${form}-glow`] = {
        kind: 'free',
        note: 'The lamp’s glow at night, drawn under the lamp.',
        sprite: art.glow,
      };
  }
  for (const [skinId, art] of Object.entries(pack.skins ?? {})) {
    const kind = skinId.slice(skinId.indexOf('-') + 1);
    sprites[kind] = {
      kind: 'free',
      note:
        kind === 'wall'
          ? 'Wallpaper tile 16x52, repeats across the room.'
          : 'Floor tile 16x8, repeats across the room.',
      sprite: art.tile,
    };
  }
  for (const art of Object.values(pack.keepsakes ?? {})) {
    sprites.keepsake = {
      kind: 'free',
      note: 'The keepsake in the cabinet when the set is complete, 12x12.',
      sprite: art,
    };
  }
  return {
    id,
    title,
    requested: '2026-11-09: player housing, furniture set art (batch E2).',
    status: 'draft',
    notes: [
      'Used by the housing feature (docs/design/housing.md): piece ids are <set>-<form>, skin ids <set>-wall and <set>-floor.',
      silhouette,
    ],
    sprites,
    backdrop: { tile: ground },
  };
}

export const HOUSE_TIDEPOOL: ConceptSet = setOf(
  'house-tidepool',
  'House set: Tidepool',
  TIDEPOOL,
  'Driftwood with scalloped shell edges; sea blue, sand, pearl white.',
  TIDEPOOL.skins?.['tidepool-wall']?.tile as SpriteDef,
);

export const HOUSE_MOONLIT: ConceptSet = setOf(
  'house-moonlit',
  'House set: Moonlit',
  MOONLIT,
  'Slim night-reef lacquer with a crescent inlay, coral pink trim, a moonstone knob and silver rims.',
  MOONLIT.skins?.['moonlit-wall']?.tile as SpriteDef,
);

export const HOUSE_EMBERHOLD: ConceptSet = setOf(
  'house-emberhold',
  'House set: Emberhold',
  EMBERHOLD,
  'Square black charwood with riveted iron bands and an amber glow.',
  EMBERHOLD.skins?.['emberhold-wall']?.tile as SpriteDef,
);

export const HOUSE_ROOTWOOD: ConceptSet = setOf(
  'house-rootwood',
  'House set: Rootwood',
  ROOTWOOD,
  'Living-wood curves with a leaf curl at the top corners and moss cushions.',
  ROOTWOOD.skins?.['rootwood-wall']?.tile as SpriteDef,
);
