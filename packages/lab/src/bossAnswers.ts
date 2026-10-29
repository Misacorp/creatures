/**
 * The intended answers of each raid boss (P-13: the board only points at answers that work). An answer is a whole raid
 * line, because a raid answer is often a placement (who stands at the row ends, who stands beside a Payoff), not one
 * Knack. Each boss has two or more answers built on different tools: Knacks of different families, a talent, a
 * placement. The lines were found by the report's own team search with the tool required, then written down here as data,
 * so the report can show them winning against the classic party.
 *
 * Line format: forms as `form/knack` or `form/knack+talent`, separated by spaces, rows separated by `|`, one row per
 * arena row (four slots each, one column per player).
 */
import { content } from '@creatures/game';
import type { Pick } from './search';
import { RAID_COLS, RAID_SPECS } from './bosses';
import { FORM_KNACKS } from './knacks';
import { LINE_POOLS, TALENTS, talentIdleUnder } from './talents';

export interface BossAnswer {
  /** What the player reads: the tool and the idea. */
  readonly label: string;
  /** The tool it is built on: a Knack family, a talent or a placement. */
  readonly tool: string;
  readonly line: string;
  /** Set when the answer is a talent: it is measured against the classic party with the same talent on every creature, not against the bare one. */
  readonly talent?: string;
  /**
   * What makes it the tool: Knack ids, and talents as `talent:<id>`. Taking these off the line (`withoutTool`) must cost it
   * (tested for the first answer of every boss: the tool the boss really asks for).
   */
  readonly core?: readonly string[];
}

/**
 * What is wrong with a line as a roster, or an empty list: an unknown form, a Knack the form cannot equip, a talent that is
 * not in the creature's line pool, works for another role than the creature's, or is idle under its Knack (Triage under a
 * Support shape Knack). An answer is legal only if this is empty (panel 4: answers use only what a player can roll).
 */
export function answerProblems(line: readonly Pick[]): string[] {
  const out: string[] = [];
  for (const p of line) {
    const c = content.creatures.find((x) => x.id === p.formId);
    if (!c) {
      out.push(`${p.formId} is not a form`);
      continue;
    }
    if (p.knack !== 'none' && !FORM_KNACKS[p.formId]?.includes(p.knack))
      out.push(`${p.formId} cannot equip ${p.knack}`);
    for (const t of p.talents ?? []) {
      if (!(LINE_POOLS[c.line] ?? []).includes(t))
        out.push(`${p.formId}: ${t} is not in its line's pool`);
      else if (!TALENTS[t]?.roles.includes(c.role))
        out.push(`${p.formId}: ${t} does nothing for a ${c.role}`);
      else if (talentIdleUnder(t, p.knack)) out.push(`${p.formId}: ${t} is idle under ${p.knack}`);
    }
  }
  return out;
}

/** The most copies of one form in a line. */
export function mostCopies(line: readonly Pick[]): number {
  const n = new Map<string, number>();
  for (const p of line) n.set(p.formId, (n.get(p.formId) ?? 0) + 1);
  return Math.max(0, ...n.values());
}

/** A line without its tool: the `core` Knacks become no Knack, the `core` talents are dropped. */
export function withoutTool(line: readonly Pick[], core: readonly string[]): Pick[] {
  const talents = new Set(core.filter((c) => c.startsWith('talent:')).map((c) => c.slice(7)));
  return line.map((p) => ({
    formId: p.formId,
    knack: core.includes(p.knack) ? 'none' : p.knack,
    ...(p.talents?.length ? { talents: p.talents.filter((t) => !talents.has(t)) } : {}),
  }));
}

/** A line spec as picks: rows in order, slots left to right. */
export function answerLine(spec: string): Pick[] {
  return spec
    .split('|')
    .flatMap((row) => row.trim().split(/\s+/))
    .filter((t) => t !== '')
    .map((token) => {
      const [form = '', rest = 'none'] = token.split('/');
      const [knack = 'none', ...talents] = rest.split('+');
      return { formId: form, knack, ...(talents.length ? { talents } : {}) };
    });
}

/** The slots a boss's arena holds. */
export const arenaSize = (bossId: string): number =>
  (RAID_SPECS.find((s) => s.id === bossId)?.rows ?? 0) * RAID_COLS;

/**
 * The answers, found by the lab's team search with the tool required (`scratch` searches over legal rosters: a creature's
 * Knack from its form, its talents from its line's pool and its role), then written down. Each boss's first answer is the tool
 * it really asks for, and it uses at most two copies of any form (a roster a table of four players can bring). Tested: every line is
 * legal, beats the classic party, and the first answer loses much of its win rate without its `core`.
 */
export const BOSS_ANSWERS: Readonly<Record<string, readonly BossAnswer[]>> = {
  'tidal-colossus': [
    {
      label: 'Wide Reach Guards in the middle of every row cover the whole sweep',
      tool: 'Reach',
      core: ['wide-reach'],
      line: 'voltaro/zoom+edge-walker ancientshell/living-shelter+hardy bogwarden/wide-reach+long-shadow gaiadrake/leave-a-trail+opportunist | bloomback/none+opportunist hearthshell/keep-the-heat-in+hardy solmane/none+shoulder-to-shoulder mistnewt/wide-reach+flank-guard | geyserpup/leave-a-trail+finisher croakmire/squelch-song+clinging tempestray/leave-a-trail+slow-burn thornbuck/wide-reach+flank-guard',
    },
    {
      label: 'Living Shelter and Keep the Heat In on every row blunt the waves',
      tool: 'Row Ward',
      core: ['living-shelter', 'keep-the-heat-in'],
      line: 'ancientshell/living-shelter+finisher hearthshell/keep-the-heat-in+hardy solmane/crown-of-embers+shoulder-to-shoulder ancientshell/living-shelter+owners-mark | pyrelynx/leave-a-trail+steady-rhythm croakmire/squelch-song+hardy bogwarden/none+flank-guard drizzlewt/drizzle+overheal-spill | hearthshell/keep-the-heat-in+catch-breath sunfawn/curl-up+brace geyserpup/all-at-once magmole/tunnel-through+bright-boost',
    },
  ],
  'cinder-wyrm': [
    {
      label:
        'Squelch Song keeps Mired on the Wyrm, so Forge Heat cannot build and each hit lands softer',
      tool: 'Debuff',
      core: ['squelch-song'],
      line: 'bloomback/all-at-once bogwarden/draw-fire+brace lanternfin/lantern-glow+triage halcyray/gather-calm+catch-breath | aurorix/starlight+bright-boost pyrelynx/guards-shadow+sharp-claws fogwyrm/hide-in-mist+flank-guard tempestray/leave-a-trail+catch-breath | croakmire/squelch-song+unbothered fogwyrm/wide-reach+unbothered geyserpup/all-at-once+edge-walker croakmire/squelch-song+clinging | bogwarden/wide-reach+flank-guard coralynx/territorial+odd-one-out lanternfin/sunbeam+odd-one-out magmole/wide-warmth+bright-boost',
    },
    {
      label: 'Circle Round and Clear the Air heal the Payoffs its reflected hits land on',
      tool: 'Sustain',
      core: ['clear-the-air', 'circle-round'],
      line: 'hearthshell/draw-fire+brace magmole/tunnel-through+bright-boost coralynx/detonate+first-pounce fogwyrm/none+flank-guard | geyserpup/leave-a-trail+first-pounce bogwarden/draw-fire+brace drizzlewt/clear-the-air+unbothered tidewing/circle-round+first-pounce | geyserpup/all-at-once+hardy fogwyrm/none+catch-breath drizzlewt/clear-the-air+overheal-spill tidewing/lead-the-way+edge-walker | lanternfin/sunbeam+odd-one-out magmole/tunnel-through+hardy bogwarden/wide-reach+long-shadow lanternfin/sunbeam+overheal-spill',
    },
  ],
  thornmother: [
    {
      label: 'Tunnel Through gets hits past her thick bark',
      tool: 'Pierce',
      core: ['tunnel-through'],
      line: 'solmane/none+catch-breath lanternfin/lantern-glow+rally-cry bogwarden/draw-fire+brace geyserpup/leave-a-trail+first-pounce | hearthshell/keep-the-heat-in+hardy magmole/tunnel-through squelch/squelch-song hearthshell/hearth+stubborn | pyrelynx/none+front-liner magmole/tunnel-through+odd-one-out bogwarden/draw-fire+flank-guard ancientshell/living-shelter+brace',
    },
    {
      label: 'Lantern Glow keeps the creatures beside it from falling quiet at the row ends',
      tool: 'Ward',
      core: ['lantern-glow'],
      line: 'bloomback/leave-a-trail+hardy bogwarden/mud-wall+clinging drizzlewt/curl-up+unbothered croakmire/squelch-song+clinging | hearthshell/draw-fire+brace magmole/tunnel-through+hardy magmole/tunnel-through+brace solmane/lead-the-way+catch-breath | fogwyrm/wide-reach+flank-guard lanternfin/lantern-glow+rally-cry lanternfin/lantern-glow+catch-breath geyserpup/puddle-maker+finisher',
    },
  ],
  'storm-sovereign': [
    {
      label: 'Draw Fire pulls the Rod onto a Guard that can take it',
      tool: 'Taunt',
      core: ['draw-fire'],
      line: 'croakmire/squelch-song+hardy sunfawn/none+brace sunfawn/curl-up+kindred-boost hearthshell/draw-fire+hardy | fogwyrm/wide-reach+flank-guard magmole/ready-the-mark+rally-cry croakmire/squelch-song+heavy-hand bogwarden/draw-fire+clinging',
    },
    {
      label: 'Catch the Bolts and Guards beside the Payoffs take the aimed strikes',
      tool: 'Intercept',
      core: ['catch-the-bolts'],
      line: 'squelch/squelch-song+clinging bogwarden/mud-wall+long-shadow bloomback/none+stubborn hearthshell/keep-the-heat-in+brace | voltaro/double-mark+edge-walker ohmouse/catch-the-bolts+shoulder-to-shoulder bogwarden/mud-wall+brace bloomback/detonate+opportunist',
    },
  ],
  'old-bogback': [
    {
      label: 'Mud Wall keeps Mired on it while Drizzle and Hearth keep the most hurt up',
      tool: 'Mud Wall',
      core: ['mud-wall'],
      line: 'bogwarden/mud-wall+clinging drizzlewt/drizzle+overheal-spill sunfawn/none+kindred-boost pyrelynx/none+shoulder-to-shoulder | kilnmole/keep-the-heat-in+hardy zipmouse/zoom+deep-ink hearthshell/hearth+catch-breath gaiadrake/none+opportunist | ancientshell/living-shelter+stubborn bogwarden/mud-wall+flank-guard pyrelynx/guards-shadow+rally-cry squelch/ready-the-mark+heavy-hand',
    },
    {
      label: 'Hearth at round start heals the creatures the fen sinks first',
      tool: 'Sustain',
      core: ['hearth'],
      line: 'kilnmole/keep-the-heat-in+brace voltaro/zoom+first-pounce ancientshell/steady-mark+finisher bogwarden/draw-fire+flank-guard | ancientshell/living-shelter+rally-cry thornbuck/none+flank-guard sunfawn/none+kindred-boost bloomback/leave-a-trail | pyrelynx/leave-a-trail+steady-rhythm hearthshell/hearth+shoulder-to-shoulder hearthshell/hearth+stubborn pyrelynx/detonate+first-pounce',
    },
  ],
};
