/**
 * What each dungeon foe asks, as a measured question (Misa, 2026-10-29: every dungeon foe measurably calls for at least one
 * mechanic; panel 5 found 12 of 15 that called for nothing, because the best searched team beats an ordinary foe whatever
 * it carries). A question is a team of three with a tool and the same team without it, against the foe at a depth and in a form
 * the game has: the base floors' numbers or the Undercroft's, as a normal foe or as an elite (`RULES.dungeon.elite`). The foe
 * calls for the tool's mechanic when the team with it wins clearly more fights (`FOE_QUESTION_GAP`). Each foe has one, and
 * the report reads them next to the ablation of the best searched team at the depth where that team wins 30% to 90%.
 *
 * Since the dungeon's easier baseline (2026-11-04) a team that carries the tool clears nearly every base-floor foe, and so does the team
 * without it, so a question is asked where the game's foes are still hard: the Undercroft, often as an elite. Two foes ask
 * nothing before that: static-bat and flicker-swarm ask only from Undercroft depth 50, as an elite. (Puddle-imp, ash-sprite and bog-toad
 * asked nothing until 2026-11-05, when each got an escalation of its own and the HP that lets it run; their questions are the game's now.) The findings are in `docs/design/combat/balance.md` section 8 (2026-11-05).
 */
import { RULES } from '@creatures/game';
import { answerLine, withoutTool } from './bossAnswers';
import { gauntletStats } from './dungeon';
import { packOf } from './dungeonKnobs';
import { foeAt } from './foes';
import type { Pick } from './search';

/** The form of the foe a question is asked against. */
export interface QuestionProbe {
  /** The game's foe at the depth: the base floors' or the Undercroft's numbers, as a normal foe or an elite. */
  readonly side: 'base' | 'undercroft';
  readonly elite: boolean;
}

const UNDER: QuestionProbe = { side: 'undercroft', elite: false };
const UNDER_ELITE: QuestionProbe = { side: 'undercroft', elite: true };

export interface FoeQuestion {
  readonly foe: string;
  /** The mechanic it calls for: an id of `MECHANICS` (`family:Debuff`, ...). */
  readonly mechanic: string;
  /** The Knacks that are the tool (taken off the team in the "without" run). */
  readonly tool: readonly string[];
  /** The foe's depth: for the Undercroft, the depth its foes are built at (the run's depth plus the level). */
  readonly depth: number;
  readonly probe: QuestionProbe;
  /** The team with the tool (rows of three, a row of the dungeon). */
  readonly team: string;
  /** The team without it, when taking the Knack off is not what the question is about (a Guard at all: a third hitter instead). */
  readonly without?: string;
}

/** The team with the tool must win this share of its fights, and win this much more often than the team without it. */
export const FOE_QUESTION_WIN = 0.55;
export const FOE_QUESTION_GAP = 0.25;

export const FOE_QUESTIONS: Readonly<Record<string, FoeQuestion>> = Object.fromEntries(
  (
    [
      // A Barrage of splashes lands on every creature of a small team at once, two more Barrages every round: a Guard with Wide Reach beside the others covers them all (an area hit).
      [
        'puddle-imp',
        'family:Reach',
        ['wide-reach'],
        30,
        UNDER,
        'tidewing/steady-mark thornbuck/wide-reach tempestray/detonate',
        'tidewing/steady-mark pyrelynx/none tempestray/detonate',
      ],
      // The Setter and the Payoff stand at the ends and fall quiet, unless Lantern Glow stands between them.
      [
        'drift-wisp',
        'family:Silence Guard',
        ['lantern-glow'],
        25,
        UNDER,
        'tidewing/steady-mark lanternfin/lantern-glow tempestray/detonate',
      ],
      // Marks are shed after every boss turn: a Guard that marks as it takes a hit marks after the shedding.
      [
        'ember-mite',
        'family:Guard Prime',
        ['primed-by-pain'],
        10,
        UNDER_ELITE,
        'tidewing/none thornbuck/primed-by-pain pyrelynx/none',
      ],
      // Its ash hardens every round and every second round it fizzles (reactions fail until its next turn): a Guard that builds Heat doubles the Payoff's reaction to get through the armour it grows.
      // Its HP is 16000 since the Fizzle move (2026-11-06; 18000 made the team with the tool win 0.40 at depth 30).
      [
        'ash-sprite',
        'family:Store',
        ['baked-shell'],
        30,
        UNDER,
        'tidewing/none kilnmole/baked-shell tempestray/none',
      ],
      // Its hide Blocks small hits: Sense Weakness gets the Payoff's plain hits past it.
      [
        'bramble-hound',
        'family:Pierce',
        ['tunnel-through'],
        20,
        UNDER,
        'tidewing/steady-mark magmole/tunnel-through tempestray/detonate',
      ],
      // A Guard beside the Payoff takes the aimed grab; with a third hitter instead, it lands on the strongest.
      [
        'moss-lurker',
        'family:Reach',
        ['wide-reach'],
        24,
        UNDER,
        'tidewing/steady-mark tempestray/detonate thornbuck/wide-reach',
        'tidewing/steady-mark tempestray/detonate pyrelynx/none',
      ],
      // No hit deals more than a cap: dodge keeps the team on its feet while it hits often.
      [
        'static-bat',
        'family:Evasion',
        ['zoom'],
        53,
        UNDER_ELITE,
        'voltaro/zoom thornbuck/none tempestray/none',
      ],
      // Sparks everywhere: a row ward cuts every area hit.
      [
        'flicker-swarm',
        'family:Row Ward',
        ['keep-the-heat-in'],
        54,
        UNDER_ELITE,
        'tidewing/steady-mark kilnmole/keep-the-heat-in tempestray/detonate',
      ],
      // It swells every round and washes every debuff off every third: a Mired that comes back every round slows the swelling.
      [
        'bog-toad',
        'family:Debuff',
        ['squelch-song'],
        30,
        UNDER,
        'tidewing/none croakmire/squelch-song tempestray/none',
      ],
      // Black, thick and draining: healing is halved and little gets through its armour, so a boost that reaches the far hitter too
      // (Wide Embrace, standing at the end of the line) is worth more than a heal.
      [
        'tar-leech',
        'family:Support shape',
        ['wide-warmth'],
        26,
        UNDER_ELITE,
        'croakmire/wide-warmth tidewing/steady-mark tempestray/detonate',
      ],
      // The gates open on the whole line: Take It All takes the sweeps.
      [
        'drowned-warden',
        'family:Intercept',
        ['catch-the-bolts'],
        30,
        UNDER_ELITE,
        'tidewing/none ohmouse/catch-the-bolts tempestray/none',
      ],
      // Its shell thickens with every reaction: a Mired that comes back every round holds the Molten Shell down.
      [
        'slag-tyrant',
        'family:Debuff',
        ['squelch-song'],
        30,
        UNDER,
        'tidewing/steady-mark croakmire/squelch-song tempestray/detonate',
      ],
      // She silences the ends: a Guard that marks as it takes a hit does the Setter's work.
      [
        'bramble-matron',
        'family:Guard Prime',
        ['primed-by-pain'],
        12,
        UNDER_ELITE,
        'tidewing/none thornbuck/primed-by-pain pyrelynx/none',
      ],
      // A race against a charge that builds: Heat doubles the reactions.
      [
        'coil-baron',
        'family:Store',
        ['baked-shell'],
        10,
        UNDER_ELITE,
        'tidewing/none kilnmole/baked-shell tempestray/none',
      ],
      // A heavy sweep announced at round start: Night Watch takes the first Wind-up hit of each boss turn.
      [
        'fen-lurker',
        'family:Intercept',
        ['night-watch'],
        35,
        UNDER,
        'tidewing/none thornbuck/night-watch tempestray/none',
      ],
    ] as const
  ).map(
    ([foe, mechanic, tool, depth, probe, team, ...rest]) =>
      [
        foe,
        {
          foe,
          mechanic,
          tool,
          depth,
          probe,
          team,
          ...(rest[0] ? { without: rest[0] } : {}),
        } satisfies FoeQuestion,
      ] as const,
  ),
);

export interface FoeQuestionResult {
  readonly question: FoeQuestion;
  /** Win rates, 0 to 1, with and without the tool. */
  readonly withTool: number;
  readonly without: number;
  readonly gap: number;
}

/** The foe a question is asked against: the game's foe at the depth (an elite with the elite's boost). */
export function questionFoe(q: FoeQuestion) {
  const p = q.probe;
  const base = foeAt(q.foe, q.depth, {}, packOf(undefined, p.side));
  if (!p.elite) return base;
  const e = RULES.dungeon.elite;
  return {
    ...base,
    hp: Math.max(1, Math.floor((base.hp * e.hpBp) / 10_000)),
    atk: Math.max(1, Math.floor((base.atk * e.atkBp) / 10_000)),
  };
}

/** A question's foe in words, for the report: its depth and the form it takes. */
export function probeText(q: FoeQuestion): string {
  const p = q.probe;
  return `${p.side === 'undercroft' ? 'Undercroft' : 'base floor'} ${p.elite ? 'elite' : 'foe'} at depth ${q.depth}`;
}

/** `fights` seeded fights of the team with its tool and without it, on the same seeds. */
export function questionResult(q: FoeQuestion, fights: number, salt: string): FoeQuestionResult {
  const foe = questionFoe(q);
  const team: Pick[] = answerLine(q.team);
  const a = gauntletStats(foe, team, fights, `${salt}:${q.foe}`);
  const b = gauntletStats(
    foe,
    q.without ? answerLine(q.without) : withoutTool(team, q.tool),
    fights,
    `${salt}:${q.foe}`,
  );
  return { question: q, withTool: a.winRate, without: b.winRate, gap: a.winRate - b.winRate };
}
