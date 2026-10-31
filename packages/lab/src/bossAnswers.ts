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
   * (tested for every answer, panel 5: it must cost at least `TOOL_SHARE_MIN` of the boss's HP removed; the first answer of each boss must also cost `TOOL_DROP_MIN` points of kill rate).
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

/**
 * The species a new player can have (Misa, 2026-10-29, panel 5 finding 10): the common ones, and Tempestray, the classic party's
 * Payoff. Each boss's first answer is built from these only, so no rare or epic form is required to answer a boss.
 */
export const COMMON_OR_CLASSIC_FORMS: readonly string[] = [
  ...content.creatures.filter((c) => c.rarity === 'common').map((c) => c.id),
  'tempestray',
];

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
 * The answers, found by the lab's team search (panel 5, content and tuning): the score is a team's result with random legal
 * talents (a talent is about a fifth of a result, so it must not decide the weekend) minus a share of what the same line does
 * without its tool, over a whole weekend and its share of the boss's HP removed (the primary measure, Misa 2026-10-29), with the tool
 * required, at most two copies of a form (a roster four players can bring) and, for the first answer of each boss, common
 * species only (`COMMON_OR_CLASSIC_FORMS`: no rare evolved form is needed). The written talents were then chosen so that the line
 * with its tool does well and the same line without it does badly (they do not stand in for the tool). Each boss's first answer is the
 * tool it really asks for. Tested: every line is legal, beats the classic party, removes nearly all of the HP, every answer
 * removes at least `TOOL_SHARE_MIN` more of the boss's HP with its tool and the first loses `TOOL_DROP_MIN` points of kill rate
 * without it, and the lines are checked for gates (no Knack family is a must on three bosses, `GATE_BOSSES`).
 */
export const BOSS_ANSWERS: Readonly<Record<string, readonly BossAnswer[]>> = {
  'tidal-colossus': [
    {
      label: 'Wide Reach Guards in every column cover the whole sweep',
      tool: 'Reach',
      core: ['wide-reach'],
      line: 'kilnmole/keep-the-heat-in+brace bogwarden/wide-reach+long-shadow drizzlewt/clear-the-air+bright-boost tempestray/none+edge-walker | tidewing/lead-the-way+owners-mark fogwyrm/wide-reach+catch-breath voltaro/none+odd-one-out drizzlewt/curl-up+bright-boost | fogwyrm/wide-reach+unbothered sunfawn/curl-up+brace tempestray/leave-a-trail+slow-burn tidewing/double-mark+owners-mark',
    },
    {
      label: 'Barricade and Living Shelter on every row blunt the waves',
      tool: 'Row Ward',
      core: ['living-shelter', 'keep-the-heat-in'],
      line: 'kilnmole/keep-the-heat-in+brace drizzlewt/clear-the-air+catch-breath halcyray/clear-the-air+bright-boost thornbuck/primed-by-pain+flank-guard | gaiadrake/detonate+catch-breath kilnmole/keep-the-heat-in+hardy ancientshell/living-shelter+finisher thornbuck/night-watch+flank-guard | halcyray/none+edge-walker gaiadrake/carry-them+finisher ancientshell/living-shelter+finisher bogwarden/wide-reach+flank-guard',
    },
  ],
  'cinder-wyrm': [
    {
      label:
        'Squelch Song keeps Mired on the Wyrm, so Forge Heat builds slowly and each hit lands softer',
      tool: 'Debuff',
      core: ['squelch-song'],
      line: 'magmole/none fogwyrm/thick-fog ohmouse/none geyserpup/none+finisher | tidewing/circle-round+finisher magmole/tunnel-through+bright-boost fogwyrm/wide-reach+flank-guard drizzlewt/none+catch-breath | croakmire/squelch-song+clinging bogwarden/draw-fire+brace drizzlewt/none+bright-boost croakmire/squelch-song | splashet/none+hardy pyrelynx/gnaw-through bogwarden/draw-fire squelch/squelch-song',
    },
    {
      label: 'Returning Tide and Clear the Air heal the Payoffs its reflected hits land on',
      tool: 'Sustain',
      core: ['circle-round', 'clear-the-air'],
      line: 'bogwarden/draw-fire+hardy tempestray/twin-strike+slow-burn kilnmole/draw-fire+shoulder-charge geyserpup/none+finisher | croakmire/squelch-song+clinging coralynx/leave-a-trail+finisher fogwyrm/hide-in-mist+flank-guard tempestray/twin-strike+slow-burn | geyserpup/puddle-maker+first-pounce ohmouse/none+shoulder-to-shoulder voltaro/zigzag+shoulder-to-shoulder sunfawn/sunbeam+hardy | fogwyrm/wide-reach+flank-guard croakmire/squelch-song+heavy-hand tidewing/circle-round+owners-mark tidewing/circle-round+owners-mark',
    },
  ],
  thornmother: [
    {
      label: 'Sense Weakness and Find the Gap get hits past her thick bark',
      tool: 'Pierce',
      core: ['tunnel-through', 'gnaw-through'],
      line: 'kilnmole/keep-the-heat-in+hardy magmole/tunnel-through+kindred-boost magmole/tunnel-through+hardy wickat/none+first-pounce | wickat/lead-the-way+first-pounce bogwarden/draw-fire+long-shadow sunfawn/none+triage sunfawn/ready-the-mark+shoulder-to-shoulder | fogwyrm/none+flank-guard pyrelynx/gnaw-through+first-pounce ohmouse/none pyrelynx/gnaw-through+rally-cry',
    },
    {
      label: 'Big reactions (Detonate, All In) go through the bark that stops plain hits',
      tool: 'Reactions',
      core: ['detonate', 'all-at-once'],
      line: 'thornbuck/night-watch+hardy solmane/lead-the-way+catch-breath ohmouse/lightning-ears+shoulder-to-shoulder voltaro/double-mark+deep-ink | kilnmole/draw-fire+hardy solmane/crown-of-embers bloomback/all-at-once+finisher kilnmole/draw-fire+odd-one-out | ohmouse/lightning-ears geyserpup/all-at-once+finisher voltaro/none kilnmole/none',
    },
  ],
  'storm-sovereign': [
    {
      label: 'Draw Fire pulls the Rod onto a Guard that can take it',
      tool: 'Taunt',
      core: ['draw-fire', 'zigzag'],
      line: 'bogwarden/draw-fire+clinging sunfawn/curl-up+brace tidewing/lead-the-way+first-pounce croakmire/squelch-song+heavy-hand | tempestray/twin-strike+edge-walker sunfawn/curl-up+kindred-boost thornbuck/wide-reach+flank-guard tempestray/none+catch-breath',
    },
    {
      label: 'Night Watch takes the Judgement Bolt meant for the strongest Payoff',
      tool: 'Intercept',
      core: ['night-watch'],
      line: 'kilnmole/draw-fire+hardy sunfawn/curl-up+brace croakmire/squelch-song+clinging ohmouse/lightning-ears | halcyray/clear-skies gaiadrake/leave-a-trail+hardy sunfawn/curl-up+kindred-boost thornbuck/night-watch',
    },
  ],
  'old-bogback': [
    {
      label: 'Returning Tide heals the Setters and Payoffs the fen sinks first, row after row',
      tool: 'Sustain',
      core: ['hearth', 'circle-round', 'clear-the-air'],
      line: 'tempestray/twin-strike magmole/tunnel-through+odd-one-out sunfawn/ready-the-mark+shoulder-to-shoulder thornbuck/night-watch+flank-guard | tidewing/circle-round kilnmole/keep-the-heat-in+hardy magmole/none+bright-boost tempestray/none+slow-burn | pyrelynx/none+rally-cry drizzlewt/clear-the-air+overheal-spill tidewing/circle-round+finisher mudlump/wide-reach',
    },
    {
      label: 'Living Shelter and Barricade shield the creatures the mud sinks',
      tool: 'Row Ward',
      core: ['living-shelter', 'keep-the-heat-in'],
      line: 'ancientshell/living-shelter+finisher sunfawn/curl-up+hardy wickat/none+sharp-claws stormray/none+edge-walker | pyrelynx/leave-a-trail+steady-rhythm kilnmole/baked-shell+brace coralynx/territorial+finisher kilnmole/keep-the-heat-in+hardy | geyserpup/puddle-maker croakmire/wide-warmth+catch-breath mistnewt/none bogwarden/none+flank-guard',
    },
  ],
};
