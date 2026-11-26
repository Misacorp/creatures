/**
 * The raid canvas's two open choices of Misa's (docs/design/combat/raid-screen.md, "Choices that stay Misa's"), as plain configuration:
 * "the API should accept a configuration, not a description of its surroundings". The canvas never asks whether it is on a phone to pick
 * a look; its caller hands in a `RaidCanvasConfig`, and `defaultConfig` is the one place that turns "a phone" into the reviewer's picks.
 *
 * - `seatPlates`: `all` prints name and level on every seat; `mine` only on your own creatures (the others rely on the board itself:
 *   picture, role, the owner's initial; a tap has the rest).
 * - `creatureTap`: `drawer` opens the right drawer at once (a full page on a phone); `popover-first` first shows a popover and lights the
 *   creature's reach on the board, with Open for the full view.
 * - `partnerLook`: how the reaction partners of a touched creature are lit (`reaction-partners.ts`): `badge` the mark's icon on each partner
 *   (the pick), `glow` a soft wash in the mark's colour, `dim` everything else recedes.
 */
import type { PartnerLook } from '../reaction-partners';

export type SeatPlates = 'all' | 'mine';
export type CreatureTap = 'drawer' | 'popover-first';

export interface RaidCanvasConfig {
  seatPlates: SeatPlates;
  creatureTap: CreatureTap;
  partnerLook: PartnerLook;
}

/** The reviewer's picks: plates on your own seats, and on a phone a popover first (a wide window's drawer hides nothing). */
export function defaultConfig(phone: boolean): RaidCanvasConfig {
  return {
    seatPlates: 'mine',
    creatureTap: phone ? 'popover-first' : 'drawer',
    partnerLook: 'dim',
  };
}

/** What the caller gives: any part left out takes the default. */
export function resolveConfig(
  phone: boolean,
  given: Partial<RaidCanvasConfig> | undefined,
): RaidCanvasConfig {
  return { ...defaultConfig(phone), ...given };
}

export const isSeatPlates = (value: unknown): value is SeatPlates =>
  value === 'all' || value === 'mine';
export const isCreatureTap = (value: unknown): value is CreatureTap =>
  value === 'drawer' || value === 'popover-first';
