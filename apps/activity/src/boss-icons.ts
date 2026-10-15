/**
 * The icons on the boss card: the turn order and one icon for each trick. Each icon opens a small
 * popover that holds what used to be the "How the boss fights" text. Pure: the screen draws them.
 */
import { GLOSSARY_IDS, entryView } from '@creatures/game';
import type { RaidView } from './raid-api';
import { gimmickLines, turnOrderShort, turnOrderText } from './raid-text';

export interface BossIconInfo {
  /** Stable key within the card. */
  key: string;
  kind: 'turn' | 'gimmick';
  /** The key of the glyph: the turn order, or the gimmick's `op` (empty when it has none). */
  glyph: string;
  /** The few words under the icon. */
  caption: string;
  /** Names the button for assistive technology. */
  label: string;
  /** The popover's title. */
  title: string;
  /** What this boss does, in plain words, specific to this boss. */
  detail: string;
  /** The glossary's general line for this kind of trick or order; null when there is none. */
  general: string | null;
  /** The rank this trick starts at when it is new this week (its `fromRank` is the week's rank); else null. */
  newAtRank: number | null;
}

/**
 * The turn order first, then the tricks in the boss's own order. `boss.gimmicks` are the moves in
 * play at the week's rank (the server filters them), and a trick whose `fromRank` is the week's
 * `effectiveRank` is marked new.
 */
export function bossIcons(
  boss: Pick<RaidView['boss'], 'id' | 'turnOrder' | 'gimmicks'>,
  effectiveRank: number | null = null,
): BossIconInfo[] {
  const order = entryView(GLOSSARY_IDS.turnOrder(boss.turnOrder));
  const icons: BossIconInfo[] = [
    {
      key: `turn:${boss.turnOrder}`,
      kind: 'turn',
      glyph: boss.turnOrder,
      caption: turnOrderShort(boss.turnOrder),
      label: `Turn order: ${turnOrderShort(boss.turnOrder)}. What does this mean?`,
      title: order?.title ?? 'Turn order',
      detail: turnOrderText(boss.turnOrder),
      general: order?.short ?? null,
      newAtRank: null,
    },
  ];
  const fresh = new Map(
    boss.gimmicks.flatMap((g) =>
      g.fromRank !== undefined && g.fromRank === effectiveRank ? [[g.id, g.fromRank] as const] : [],
    ),
  );
  for (const g of gimmickLines(boss.id, boss.gimmicks)) {
    const newAtRank = fresh.get(g.id) ?? null;
    const general = g.op === null ? undefined : entryView(GLOSSARY_IDS.gimmick(g.op));
    icons.push({
      key: `gimmick:${g.id}`,
      kind: 'gimmick',
      glyph: g.glyph ?? '',
      caption: g.name,
      label: `${g.name}${newAtRank === null ? '' : `, new at rank ${String(newAtRank)}`}: what does this trick do?`,
      title: g.name,
      detail: `${g.text !== '' ? g.text : g.short}${newAtRank === null ? '' : ` New at rank ${String(newAtRank)}.`}`,
      general: general?.short ?? null,
      newAtRank,
    });
  }
  return icons;
}
