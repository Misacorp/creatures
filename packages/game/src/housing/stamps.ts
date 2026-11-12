/** Feat stamps (`docs/design/housing.md` 2.2). */
import type { HouseFeats } from './hook';
import type { HousingContent } from './schema';

/** A journal set's page ids, from the journal's entries (`{ id, set }`), for the `journal-set` stamps. */
export function journalSetPages(
  entries: readonly { id: string; set: string }[],
): Map<string, readonly string[]> {
  const out = new Map<string, string[]>();
  for (const e of entries) {
    const pages = out.get(e.set);
    if (pages === undefined) out.set(e.set, [e.id]);
    else pages.push(e.id);
  }
  return out;
}

/**
 * The feat stamps whose unlock holds now, in content order. Never the `starter` stamp (given with the house) nor the `drop`
 * ones (rolled). `journalSets` maps a journal set to its page ids; without it no `journal-set` stamp is earned.
 */
export function stampsEarned(
  content: HousingContent,
  feats: HouseFeats,
  journalSets: ReadonlyMap<string, readonly string[]> = new Map(),
): string[] {
  const out: string[] = [];
  for (const stamp of content.stamps) {
    const u = stamp.unlock;
    let earned = false;
    switch (u.kind) {
      case 'starter':
      case 'drop':
        break;
      case 'journal-set': {
        const pages = journalSets.get(u.set);
        earned =
          pages !== undefined && pages.length > 0 && pages.every((p) => feats.journalPages.has(p));
        break;
      }
      case 'stat':
        earned = (feats.stats[u.stat] ?? 0) >= u.at;
        break;
      case 'raid-boss':
        earned = feats.bossesBeaten.has(u.boss);
        break;
      case 'dungeon-depth':
        earned = feats.dungeonDepth >= u.at;
        break;
      case 'games-medal':
        earned = feats.medals[u.medal] >= u.at;
        break;
      case 'house-part':
        earned = feats.built.has(u.part);
        break;
      case 'house-sets':
        earned = feats.setsComplete >= u.at;
        break;
    }
    if (earned) out.push(stamp.id);
  }
  return out;
}
