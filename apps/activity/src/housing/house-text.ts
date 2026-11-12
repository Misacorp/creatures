/**
 * Words for the house scene's buttons and popovers (pure): the spoken name of a spot, and what a trophy display lists when
 * it is tapped. Names come from the housing content and the game's content; every string is plain text.
 */
import { content, type DisplayView, type SpotType } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { speciesName } from '../game';
import { destinationName } from '../trip-view';

/** What a spot type is called ("Small floor"), for "Small floor: empty". */
export const SPOT_NAMES: Readonly<Record<SpotType, string>> = {
  window: 'Window',
  'wall-large': 'Big wall',
  'wall-small': 'Small wall',
  ceiling: 'Ceiling',
  'floor-large': 'Big floor',
  'floor-small': 'Small floor',
  rug: 'Rug',
  display: 'Display',
  'yard-large': 'Big yard',
  'yard-small': 'Small yard',
  fence: 'Fence',
  poolside: 'Poolside',
  water: 'Water',
  porch: 'Porch',
};

/** The name of a piece or a skin ("Tidepool Curtains"), or its id when the content does not know it. */
export function itemName(id: string): string {
  return (
    housing.pieces.find((p) => p.id === id)?.name ??
    housing.skins.find((s) => s.id === id)?.name ??
    id
  );
}

/** The spoken name of a spot button: "Window: Tidepool Curtains" or "Small floor: empty". */
export function spotLabel(type: SpotType, pieceId: string | null): string {
  return `${SPOT_NAMES[type]}: ${pieceId === null ? 'empty' : itemName(pieceId)}`;
}

function bossName(id: string): string {
  return content.bosses.find((b) => b.id === id)?.name ?? id;
}

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/** What a trophy display says when tapped: a title and one line per thing. */
export function displayText(
  data: DisplayView | null,
  label: string,
): { title: string; lines: string[] } {
  if (data === null) return { title: label, lines: [] };
  switch (data.kind) {
    case 'raid-plaques':
      return {
        title: 'Raid plaques',
        lines:
          data.plaques.length === 0
            ? data.current === null
              ? ['No boss beaten yet.']
              : [`${bossName(data.current)} is this week's boss. Beat it to hang its plaque.`]
            : [...data.plaques]
                .sort((a, b) => b.best - a.best)
                .map(
                  (p) =>
                    `${bossName(p.bossId)}: best rank ${String(p.best)}, ${plural(p.wins, 'win', 'wins')}`,
                ),
      };
    case 'games-medals':
      return {
        title: 'Games medals',
        lines: [
          `${plural(data.gold, 'gold', 'gold')}, ${plural(data.silver, 'silver', 'silver')}, ${plural(data.bronze, 'bronze', 'bronze')}`,
          ...(data.pins > 0 ? [plural(data.pins, 'pin', 'pins')] : []),
        ],
      };
    case 'games-badges':
      return {
        title: 'Event badges',
        lines:
          data.events.length === 0
            ? ['No event won yet.']
            : [plural(data.events.length, 'event badge', 'event badges')],
      };
    case 'festival':
      return {
        title: 'Festival case',
        lines:
          data.species.length === 0
            ? ['No Festival creature won yet.']
            : data.species.map(speciesName),
      };
    case 'keepsakes':
      return {
        title: 'Valley keepsakes',
        lines:
          data.places.length === 0
            ? ['None yet.']
            : data.places.map((p) => `${destinationName(p.place)}: ${String(p.count)}`),
      };
    case 'journal':
      return {
        title: 'Journal books',
        lines: [
          `${plural(data.sets.length, 'set', 'sets')} complete`,
          plural(data.pages, 'page', 'pages'),
        ],
      };
    case 'dungeon':
      return {
        title: 'Dungeon marker',
        lines: [`Deepest: depth ${String(data.depth)}`, plural(data.clears, 'clear', 'clears')],
      };
    case 'set-keepsakes':
      return {
        title: 'Set keepsakes',
        lines:
          data.sets.length === 0
            ? ['Finish a furniture set to keep its keepsake here.']
            : data.sets.map((id) => housing.sets.find((s) => s.id === id)?.keepsake.name ?? id),
      };
  }
}
