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
import type { Pick } from './search';
import { RAID_COLS, RAID_SPECS } from './bosses';

export interface BossAnswer {
  /** What the player reads: the tool and the idea. */
  readonly label: string;
  /** The tool it is built on: a Knack family, a talent or a placement. */
  readonly tool: string;
  readonly line: string;
  /** Set when the answer is a talent: it is measured against the classic party with the same talent on every creature, not against the bare one. */
  readonly talent?: string;
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

export const BOSS_ANSWERS: Readonly<Record<string, readonly BossAnswer[]>> = {
  'tidal-colossus': [
    {
      label: 'Wide Reach Guards cover the rows the waves hit',
      tool: 'Reach',
      line: 'bogwarden/mud-wall fogwyrm/wide-reach drizzlewt/curl-up tempestray/none | tidewing/double-mark tidewing/circle-round bogwarden/wide-reach tempestray/none | tempestray/none tempestray/none bogwarden/wide-reach sunfawn/sunbeam',
    },
    {
      label: 'Living Shelter and Keep the Heat In on every row',
      tool: 'Row Ward',
      line: 'bogwarden/mud-wall tempestray/none hearthshell/keep-the-heat-in tidewing/circle-round | tidewing/circle-round tempestray/leave-a-trail hearthshell/keep-the-heat-in tidewing/circle-round | tempestray/leave-a-trail tempestray/none hearthshell/keep-the-heat-in tidewing/circle-round',
    },
    {
      label: 'Brace on the creatures that stand in the surf',
      tool: 'talent: Brace',
      talent: 'brace',
      line: 'croakmire/squelch-song bloomback/none+brace thornbuck/wide-reach drizzlewt/drizzle | voltaro/none sunfawn/none+brace tempestray/none tidewing/none | tidewing/none tempestray/none sunfawn/none+brace tempestray/none',
    },
  ],
  'cinder-wyrm': [
    {
      label: 'Squelch Song keeps Mired on the Wyrm, which holds the Forge Heat',
      tool: 'Debuff',
      line: 'sunfawn/curl-up drizzlewt/none bogwarden/wide-reach croakmire/squelch-song | lanternfin/none drizzlewt/drizzle bogwarden/wide-reach hearthshell/draw-fire | bogwarden/draw-fire croakmire/squelch-song croakmire/squelch-song fogwyrm/hide-in-mist | drizzlewt/drizzle bogwarden/wide-reach lanternfin/sunbeam lanternfin/sunbeam',
    },
    {
      label: 'Clear the Air and Curl Up heal the reflected hit',
      tool: 'Sustain',
      line: 'hearthshell/hearth drizzlewt/curl-up lanternfin/clear-the-air fogwyrm/thick-fog | lanternfin/clear-the-air bogwarden/draw-fire drizzlewt/curl-up croakmire/squelch-song | drizzlewt/curl-up fogwyrm/thick-fog drizzlewt/curl-up ancientshell/steady-mark | fogwyrm/thick-fog lanternfin/clear-the-air lanternfin/clear-the-air fogwyrm/thick-fog',
    },
    {
      label:
        'Leave a Trail: only the first reaction after each of its turns is reflected, so chain the rest',
      tool: 'Chain',
      line: 'bogwarden/draw-fire sunfawn/curl-up bogwarden/draw-fire tempestray/leave-a-trail | tempestray/leave-a-trail bogwarden/draw-fire bogwarden/draw-fire drizzlewt/drizzle | tempestray/leave-a-trail fogwyrm/wide-reach tempestray/leave-a-trail drizzlewt/drizzle | croakmire/squelch-song croakmire/squelch-song fogwyrm/wide-reach sunfawn/curl-up',
    },
  ],
  thornmother: [
    {
      label: 'Living Shelter and Keep the Heat In on every row',
      tool: 'Row Ward',
      line: 'ancientshell/living-shelter sunfawn/curl-up hearthshell/hearth pyrelynx/detonate | ancientshell/living-shelter magmole/tunnel-through hearthshell/keep-the-heat-in solmane/lead-the-way | ancientshell/living-shelter croakmire/squelch-song hearthshell/keep-the-heat-in croakmire/squelch-song',
    },
    {
      label: 'Ready the Mark: Supports prime when the silenced Setters cannot',
      tool: 'Support Prime',
      line: 'sunfawn/ready-the-mark hearthshell/draw-fire sunfawn/curl-up bloomback/none | pyrelynx/none hearthshell/hearth pyrelynx/leave-a-trail sunfawn/ready-the-mark | croakmire/ready-the-mark croakmire/squelch-song hearthshell/hearth bloomback/none',
    },
    {
      label: 'Unbothered keeps the row ends talking',
      tool: 'talent: Unbothered',
      talent: 'unbothered',
      line: 'pyrelynx/none hearthshell/hearth sunfawn/curl-up magmole/none | bloomback/all-at-once hearthshell/hearth croakmire/squelch-song ancientshell/none | ancientshell/none lanternfin/sunbeam hearthshell/hearth pyrelynx/none',
    },
  ],
  'storm-sovereign': [
    {
      label: 'Draw Fire pulls the plain attack off the strongest',
      tool: 'Taunt',
      line: 'hearthshell/draw-fire sunfawn/curl-up hearthshell/draw-fire bloomback/detonate | voltaro/zoom hearthshell/draw-fire sunfawn/curl-up croakmire/squelch-song',
    },
    {
      label: 'Living Shelter and Keep the Heat In on both rows',
      tool: 'Row Ward',
      line: 'fogwyrm/wide-reach sunfawn/curl-up ancientshell/living-shelter ancientshell/living-shelter | croakmire/squelch-song croakmire/squelch-song ancientshell/living-shelter ancientshell/living-shelter',
    },
    {
      label: 'Brace on the front line against the Rod and the clap',
      tool: 'talent: Brace',
      talent: 'brace',
      line: 'croakmire/squelch-song sunfawn/none+brace sunfawn/none+brace croakmire/squelch-song | kilnmole/keep-the-heat-in sunfawn/none+brace ancientshell/none+brace sunfawn/none+brace',
    },
  ],
  'old-bogback': [
    {
      label: 'Hearth, Clear the Air and Circle Round keep the wounded up',
      tool: 'Sustain',
      line: 'tempestray/none bloomback/none hearthshell/hearth tidewing/circle-round | voltaro/zigzag bogwarden/mud-wall drizzlewt/clear-the-air bloomback/leave-a-trail | hearthshell/hearth pyrelynx/leave-a-trail tempestray/detonate tidewing/circle-round',
    },
    {
      label: 'Keep the Heat In and Living Shelter on the rows it sweeps',
      tool: 'Row Ward',
      line: 'hearthshell/keep-the-heat-in ancientshell/living-shelter bloomback/none hearthshell/keep-the-heat-in | voltaro/zigzag bogwarden/mud-wall hearthshell/keep-the-heat-in bloomback/none | bloomback/none pyrelynx/none hearthshell/keep-the-heat-in voltaro/zigzag',
    },
    {
      label: 'Catch Breath on the front, where Swallow and the flop land',
      tool: 'talent: Catch Breath',
      talent: 'catch-breath',
      line: 'bloomback/none sunfawn/none voltaro/none solmane/none+catch-breath | voltaro/zigzag bogwarden/mud-wall ancientshell/living-shelter voltaro/none | bloomback/all-at-once hearthshell/draw-fire pyrelynx/none voltaro/none',
    },
  ],
};
