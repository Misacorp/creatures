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
}

/** The turn order first, then the tricks in the boss's own order. */
export function bossIcons(
  boss: Pick<RaidView['boss'], 'id' | 'turnOrder' | 'gimmicks'>,
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
    },
  ];
  for (const g of gimmickLines(boss.id, boss.gimmicks)) {
    const general = g.op === null ? undefined : entryView(GLOSSARY_IDS.gimmick(g.op));
    icons.push({
      key: `gimmick:${g.id}`,
      kind: 'gimmick',
      glyph: g.op ?? '',
      caption: g.name,
      label: `${g.name}: what does this trick do?`,
      title: g.name,
      detail: g.text !== '' ? g.text : g.short,
      general: general?.short ?? null,
    });
  }
  return icons;
}
