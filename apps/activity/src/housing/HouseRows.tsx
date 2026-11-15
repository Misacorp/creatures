/**
 * The house page's rows (`docs/design/housing.md` 4.5): Build, Workbench, Catalogue, Mailbox and Visit, each a
 * `valley/PlaceRow` (glyph, name, the line of what is next there), never a toolbar;. (The valley's "Your house" row is `valley/YourHouseRow`, which does not touch the housing content.) The
 * lines are pure (`houseRowLines`) and read only what the page already holds.
 */
import { knownBlueprints, type HouseView, type OwnHouseView } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { PipRow } from '../ui/PipRow';
import { linesPaid } from './build-view';
import { PlaceRow } from '../valley/PlacesList';

export type HouseDrill = 'build' | 'workbench' | 'catalogue' | 'mailbox' | 'visits';

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

function partName(id: string): string {
  return housing.parts.find((p) => p.id === id)?.name ?? id;
}

/** How far the player is in finding everything: found over the whole (pieces, skins, stamps, materials and parts). */
export function foundCounts(house: HouseView, own: OwnHouseView): { found: number; total: number } {
  const pieces = Object.values(own.items.pieces).filter((n) => n > 0).length;
  const materials = Object.values(own.materials).filter((m) => m.have > 0).length;
  const found =
    pieces + own.items.skins.length + own.items.stamps.length + materials + house.built.length;
  const total =
    housing.pieces.length +
    housing.skins.length +
    housing.stamps.length +
    housing.materials.length +
    housing.parts.length;
  return { found, total };
}

export interface HouseRowLines {
  build: string;
  /** The next part's price as pips (one per line, lit when paid), or null when everything is built. */
  buildPips: { total: number; paid: number } | null;
  workbench: string;
  catalogue: string;
  mailbox: string;
  visits: string;
  /** Gifts waiting: the row shows a pip. */
  pip: boolean;
}

/** The line of each row. `houses` is how many houses the visit list holds (null until it has loaded). */
export function houseRowLines(
  house: HouseView,
  own: OwnHouseView,
  houses: number | null,
): HouseRowLines {
  const next = own.buildable[0];
  let build = 'everything is built';
  let buildPips: { total: number; paid: number } | null = null;
  if (next !== undefined) {
    const part = housing.parts.find((p) => p.id === next);
    const total = part?.price.length ?? 0;
    const progress = own.progress.find((p) => p.partId === next);
    const paid = part === undefined ? 0 : linesPaid(part.price, progress?.remaining).touched;
    build = `next: ${partName(next)}`;
    buildPips = { total, paid };
  }
  const known = knownBlueprints(housing, new Set(own.items.blueprints), new Set(house.built)).size;
  const { found, total } = foundCounts(house, own);
  const gifts = own.mailbox.gifts;
  return {
    build,
    buildPips,
    workbench: plural(known, 'blueprint known', 'blueprints known'),
    catalogue: `${String(found)} / ${String(total)} found`,
    mailbox: gifts === 0 ? 'no gifts waiting' : plural(gifts, 'gift waiting', 'gifts waiting'),
    visits: houses === null ? 'friends’ houses' : plural(houses, 'house', 'houses'),
    pip: gifts > 0,
  };
}

/** The five rows of the own house page. */
export function HouseRows({
  house,
  own,
  houses,
  onOpen,
}: {
  house: HouseView;
  own: OwnHouseView;
  houses: number | null;
  onOpen: (drill: HouseDrill) => void;
}) {
  const lines = houseRowLines(house, own, houses);
  return (
    <ul class="vy-rows house-rows" aria-label="Your house">
      <PlaceRow
        glyph="home"
        name="Build"
        line={lines.build}
        {...(lines.buildPips === null
          ? {}
          : {
              aside: (
                <PipRow
                  count={lines.buildPips.total}
                  lit={lines.buildPips.paid}
                  label={`${String(lines.buildPips.paid)} / ${String(lines.buildPips.total)} lines paid into`}
                />
              ),
            })}
        onClick={() => {
          onOpen('build');
        }}
      />
      <PlaceRow
        glyph="anvil"
        name="Workbench"
        line={lines.workbench}
        onClick={() => {
          onOpen('workbench');
        }}
      />
      <PlaceRow
        glyph="journal"
        name="Catalogue"
        line={lines.catalogue}
        onClick={() => {
          onOpen('catalogue');
        }}
      />
      <PlaceRow
        glyph="mail"
        name="Mailbox"
        line={lines.mailbox}
        pip={lines.pip}
        onClick={() => {
          onOpen('mailbox');
        }}
      />
      <PlaceRow
        glyph="door"
        name="Visit"
        line={lines.visits}
        onClick={() => {
          onOpen('visits');
        }}
      />
    </ul>
  );
}
