/**
 * What the server adds to each creature on a combat v2 board for the right drawer: its talents and the gear it wears
 * (`v2.creatures[].talents` / `.gear`). The part lands beside this one, so both are read defensively: absent or malformed means "not
 * known", and the drawer then shows the Knack and role only. Pure. Every name is the server's and is drawn as text.
 */
import type { WornItem } from '../gear-view';
import type { TalentView } from '../talent-types';
import type { BoardCreatureV2 } from '../raid-v2-api';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** The talents of a board creature as the talent chip draws them (a bare string is a name only); [] when unknown. */
export function talentsOf(entry: BoardCreatureV2 | undefined): TalentView[] {
  const raw = (entry as { talents?: unknown } | undefined)?.talents;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((t): TalentView[] => {
    if (typeof t === 'string') {
      return [{ id: t, name: t, text: '', about: '', golden: false, idle: false }];
    }
    if (isRecord(t) && typeof t['name'] === 'string') {
      return [
        {
          id: typeof t['id'] === 'string' ? t['id'] : t['name'],
          name: t['name'],
          text: typeof t['text'] === 'string' ? t['text'] : '',
          about: typeof t['about'] === 'string' ? t['about'] : '',
          golden: t['golden'] === true,
          idle: t['idle'] === true,
        },
      ];
    }
    return [];
  });
}

/** The gear a board creature wears, as the gear list draws it; [] when unknown. */
export function gearOf(entry: BoardCreatureV2 | undefined): WornItem[] {
  const raw = (entry as { gear?: unknown } | undefined)?.gear;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((g): WornItem[] =>
    isRecord(g) &&
    typeof g['baseId'] === 'string' &&
    typeof g['slot'] === 'string' &&
    typeof g['rarity'] === 'string'
      ? [
          {
            baseId: g['baseId'],
            slot: g['slot'],
            rarity: g['rarity'],
            itemLevel: typeof g['itemLevel'] === 'number' ? g['itemLevel'] : 1,
            ...(Array.isArray(g['lines']) ? { lines: g['lines'].map(String) } : {}),
          } as WornItem,
        ]
      : [],
  );
}
