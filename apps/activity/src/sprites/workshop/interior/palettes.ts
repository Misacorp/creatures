/**
 * The colourways of the room interior (`docs/design/housing-interior.md`): four tones each, so any pattern takes any
 * palette. Wallpapers stay soft (their pattern tones are close to the ground) so furniture reads on top; the dark
 * ones (midnight, charcoal, forest) are as dark as the shipped Trophy Hall, not darker.
 */
import type { Tones } from './kit';

const t = (id: string, name: string, a: string, b: string, c: string, d: string): Tones => ({
  id,
  name,
  a,
  b,
  c,
  d,
});

/** Twelve wallpaper colours. `a` ground, `b` the pattern's body, `c` its detail, `d` its line or shade. */
export const WALL_COLOURS: readonly Tones[] = [
  t('cream', 'Warm cream', '#f3e6c4', '#e8d3a4', '#dbbc8a', '#c0a070'),
  t('rose', 'Rose', '#f0cdc8', '#e4b4b0', '#d4949a', '#b06c78'),
  t('sage', 'Sage', '#cfdcb8', '#bccba2', '#a0bb8e', '#74946f'),
  t('sky', 'Sky', '#c6e0ee', '#acd0e6', '#8bbbd9', '#6094bb'),
  t('lavender', 'Lavender', '#ddd0ec', '#cabcdf', '#b09bd0', '#8574ac'),
  t('slate', 'Slate', '#9fabc0', '#8e9bb4', '#7686a2', '#56657f'),
  t('ochre', 'Ochre', '#e6c36e', '#d8ab52', '#c18e3c', '#946a2c'),
  t('terracotta', 'Terracotta', '#d98d68', '#cb7853', '#b46040', '#88432e'),
  t('forest', 'Forest', '#5f8a64', '#527b58', '#42694a', '#2f4f3a'),
  t('midnight', 'Midnight', '#2d3060', '#393d72', '#5c619c', '#1e2046'),
  t('charcoal', 'Charcoal', '#4c4859', '#413d4e', '#66627a', '#2d2a39'),
  t('white', 'White', '#f4f1ec', '#e7e2db', '#d3cdc4', '#b5afa8'),
];

/** Eight floor colours. `a` is the board or tile, `b` the shade of a second board, `c` its light edge, `d` the seam. */
export const FLOOR_COLOURS: readonly Tones[] = [
  t('oak', 'Oak', '#c8a070', '#b98d5c', '#d9b685', '#8c6542'),
  t('walnut', 'Walnut', '#8c6046', '#7c5039', '#a07252', '#5b3a2a'),
  t('ash', 'Ash', '#e0cfae', '#cebb91', '#eee1c5', '#a99670'),
  t('whitewash', 'Whitewash', '#e6e0d4', '#d4ccbe', '#f3efe7', '#aca294'),
  t('slate', 'Slate', '#7b8599', '#6b758b', '#909aac', '#4d576b'),
  t('terracotta', 'Terracotta', '#cf7a52', '#bd6745', '#e19168', '#8e4c36'),
  t('moss', 'Moss', '#5f8e6a', '#507e5c', '#7ba885', '#386049'),
  t('burgundy', 'Burgundy', '#9a3f50', '#873440', '#ba5b69', '#5f2331'),
];

/** Painted wood, dark panelling and stone: the colourways of a trim (`a` face, `b` recess, `c` light edge, `d` shade). */
export const TRIM_COLOURS: readonly Tones[] = [
  t('paint-white', 'White paint', '#f4efe4', '#e2dac9', '#fffaf1', '#b8af9b'),
  t('paint-sage', 'Sage paint', '#b9cfa9', '#a4bd94', '#d2e4c4', '#779670'),
  t('paint-blue', 'Blue paint', '#a9c9dd', '#92b7d0', '#c8e0ee', '#648cab'),
  t('paint-rose', 'Rose paint', '#e8b9b4', '#d8a09e', '#f5d4d0', '#aa6e76'),
  t('dark-walnut', 'Walnut panelling', '#6b4531', '#583625', '#8c5d43', '#3a2218'),
  t('dark-ebony', 'Ebony panelling', '#3b3141', '#2f2735', '#54485d', '#1d1721'),
  t('stone-grey', 'Grey stone', '#aeb3bd', '#9aa1ad', '#c9cdd5', '#747b89'),
  t('stone-sand', 'Sandstone', '#d4c1a1', '#bfa983', '#e7d9bd', '#8e7a59'),
];

/** The dark seen through a doorway (the passage beyond). */
export const PASSAGE = '#2a2038';
export const PASSAGE_LIGHT = '#43355a';
