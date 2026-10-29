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
   * (tested for every answer, panel 5: it must cost at least `TOOL_DROP_MIN` points of weekend win rate; the first answer of each boss must cost 40).
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
 * legal, beats the classic party, the first answer loses much of its win rate without its `core`, and every answer loses at least
 * 20 points (the answers that do not yet are listed in the test).
 */
export const BOSS_ANSWERS: Readonly<Record<string, readonly BossAnswer[]>> = {
  'tidal-colossus': [
    {
      label: 'Wide Reach Guards in every column cover the whole sweep',
      tool: 'Reach',
      core: ['wide-reach'],
      line: 'voltaro/zoom+deep-ink bogwarden/wide-reach+clinging mudlump/wide-reach+long-shadow gaiadrake/leave-a-trail+finisher | tempestray/leave-a-trail tidewing/double-mark+owners-mark coralynx/detonate+finisher fogwyrm/wide-reach+flank-guard | bogwarden/wide-reach+flank-guard tempestray/none+catch-breath croakmire/squelch-song+heavy-hand geyserpup/puddle-maker+finisher',
    },
    {
      label: 'Living Shelter and Keep the Heat In on every row blunt the waves',
      tool: 'Row Ward',
      core: ['living-shelter', 'keep-the-heat-in'],
      line: 'bogwarden/mud-wall+clinging gaiadrake/carry-them+catch-breath kilnmole/keep-the-heat-in+brace gaiadrake/leave-a-trail+stubborn | ancientshell/living-shelter+finisher thornbuck/primed-by-pain+flank-guard ancientshell/living-shelter+finisher tempestray/detonate | lanternfin/sunbeam+overheal-spill fogwyrm/thick-fog+flank-guard lanternfin/none+triage tidewing/circle-round+finisher',
    },
  ],
  'cinder-wyrm': [
    {
      label:
        'Squelch Song keeps Mired on the Wyrm, so Forge Heat cannot build and each hit lands softer',
      tool: 'Debuff',
      core: ['squelch-song'],
      line: 'geyserpup/none+finisher drizzlewt/curl-up+bright-boost bogwarden/wide-reach+long-shadow lanternfin/clear-the-air+odd-one-out | kilnmole/none+shoulder-charge tempestray/none+momentum magmole/wide-warmth+hardy fogwyrm/wide-reach+flank-guard | aurorix/starlight+rally-cry croakmire/squelch-song+catch-breath drizzlewt/drizzle+bright-boost aurorix/starlight+unbothered | bogwarden/wide-reach+flank-guard lanternfin/none+triage halcyray/none+bright-boost croakmire/squelch-song+clinging',
    },
    {
      label: 'Circle Round and Clear the Air heal the Payoffs its reflected hits land on',
      tool: 'Sustain',
      core: ['clear-the-air', 'circle-round'],
      line: 'drizzlewt/clear-the-air+overheal-spill bogwarden/wide-reach+long-shadow lanternfin/clear-the-air+odd-one-out magmole/wide-warmth+kindred-boost | geyserpup/leave-a-trail+momentum fogwyrm/hide-in-mist+catch-breath lanternfin/none+overheal-spill fogwyrm/thick-fog+unbothered | croakmire/squelch-song+clinging coralynx/territorial+finisher sunfawn/curl-up+rally-cry bogwarden/draw-fire+flank-guard | tempestray/leave-a-trail+edge-walker kilnmole/draw-fire+odd-one-out drizzlewt/curl-up+catch-breath croakmire/squelch-song+clinging',
    },
  ],
  thornmother: [
    {
      label: 'Tunnel Through gets hits past her thick bark',
      tool: 'Pierce',
      core: ['tunnel-through'],
      line: 'voltaro/zigzag bogwarden/mud-wall+clinging sunfawn/curl-up+kindred-boost bloomback/leave-a-trail+hardy | ancientshell/none+brace magmole/tunnel-through+bright-boost magmole/tunnel-through+bright-boost thornbuck/primed-by-pain+flank-guard | pyrelynx/none+first-pounce mudlump/wide-reach+clinging pyrelynx/detonate+first-pounce solmane/steady-mark+catch-breath',
    },
    {
      label: 'Lantern Glow keeps the creatures beside it from falling quiet at the row ends',
      tool: 'Ward',
      core: ['lantern-glow'],
      line: 'bogwarden/mud-wall+clinging gaiadrake/none+opportunist magmole/tunnel-through+bright-boost fogwyrm/thick-fog+catch-breath | mudlump/wide-reach+flank-guard pyrelynx/none+shoulder-to-shoulder ashmole/none+kindred-boost bloomback/detonate+stubborn | voltaro/double-mark+shoulder-to-shoulder ohmouse/lightning-ears+flank-guard lanternfin/lantern-glow+odd-one-out gaiadrake/leave-a-trail+finisher',
    },
  ],
  'storm-sovereign': [
    {
      label: 'Draw Fire pulls the Rod onto a Guard that can take it',
      tool: 'Taunt',
      core: ['draw-fire', 'zigzag'],
      line: 'gaiadrake/detonate+opportunist hearthshell/draw-fire+stubborn hearthshell/hearth+stubborn bloomback/leave-a-trail+stubborn | mudlump/mud-wall+clinging zipmouse/double-mark+shoulder-to-shoulder aurorix/gather-calm+bright-boost bloomback/detonate+opportunist',
    },
    {
      label: 'Night Watch takes the Judgement Bolt meant for the strongest Payoff',
      tool: 'Intercept',
      core: ['night-watch'],
      line: 'thornbuck/night-watch+flank-guard voltaro/zoom+shoulder-to-shoulder voltaro/zigzag+momentum hearthshell/keep-the-heat-in+stubborn | bloomback/all-at-once+stubborn hearthshell/draw-fire+stubborn gaiadrake/detonate+opportunist croakmire/squelch-song+heavy-hand',
    },
  ],
  'old-bogback': [
    {
      label: 'Mud Wall keeps Mired on it while Drizzle and Hearth keep the most hurt up',
      tool: 'Mud Wall',
      core: ['mud-wall', 'squelch-song'],
      line: 'ancientshell/steady-mark+owners-mark bogwarden/mud-wall+hardy fogwyrm/hide-in-mist+rally-cry squelch/ready-the-mark+clinging | zipmouse/double-mark+momentum hearthshell/hearth+shoulder-to-shoulder mossback/feed-the-marks+finisher gaiadrake/carry-them+catch-breath | pyrelynx/detonate+rally-cry magmole/wide-warmth+kindred-boost fogwyrm/wide-reach+catch-breath bloomback/detonate+opportunist',
    },
    {
      label: 'Hearth at round start heals the creatures the fen sinks first',
      tool: 'Sustain',
      core: ['hearth'],
      line: 'solmane/none+owners-mark drizzlewt/curl-up+rally-cry hearthshell/hearth+shoulder-charge tempestray/detonate+edge-walker | geyserpup/none+edge-walker solmane/none+deep-ink bogwarden/wide-reach+long-shadow ancientshell/living-shelter+hardy | geyserpup/leave-a-trail+edge-walker bogwarden/wide-reach+long-shadow pyrelynx/guards-shadow+shoulder-to-shoulder kilnmole/keep-the-heat-in+hardy',
    },
  ],
};
