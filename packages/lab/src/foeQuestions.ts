/**
 * What each dungeon foe asks, as a measured question (Misa, 2026-10-29: every dungeon foe measurably calls for at least one
 * mechanic; panel 5 found 12 of 15 that called for nothing, because the best searched team beats an ordinary foe whatever
 * it carries). A question is a team of three with a tool and the same team without it, at a depth and with a share of the
 * foe's HP and Attack (the stronger form it takes in an elite room or deeper down, where a fight is a close one). The foe
 * calls for the tool's mechanic when the team with it wins clearly more fights (`FOE_QUESTION_GAP`). Each foe has one, and
 * the report reads them next to the ablation of the best searched team at the depth where that team wins 30% to 90%.
 */
import { answerLine } from './bossAnswers';
import { gauntletStats } from './dungeon';
import { foeAt } from './foes';
import type { Pick } from './search';
import { withoutTool } from './bossAnswers';

export interface FoeQuestion {
  readonly foe: string;
  /** The mechanic it calls for: an id of `MECHANICS` (`family:Debuff`, ...). */
  readonly mechanic: string;
  /** The Knacks that are the tool (taken off the team in the "without" run). */
  readonly tool: readonly string[];
  readonly depth: number;
  /** The foe's HP and Attack in bp of its own at that depth (10000 is the foe as it stands). */
  readonly hpBp: number;
  readonly atkBp: number;
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
      // The fog thickens with every miss: dodge turns the small splashes away.
      [
        'puddle-imp',
        'family:Evasion',
        ['zoom'],
        5,
        15_000,
        13_000,
        'voltaro/zoom thornbuck/none tempestray/none',
      ],
      // The Setter and the Payoff stand at the ends and fall quiet, unless Lantern Glow stands between them.
      [
        'drift-wisp',
        'family:Silence Guard',
        ['lantern-glow'],
        4,
        10_000,
        10_000,
        'tidewing/steady-mark lanternfin/lantern-glow tempestray/detonate',
      ],
      // Marks are shed after every boss turn: a Guard that marks as it takes a hit marks after the shedding.
      [
        'ember-mite',
        'family:Guard Prime',
        ['primed-by-pain'],
        5,
        10_000,
        13_000,
        'tidewing/none thornbuck/primed-by-pain pyrelynx/none',
      ],
      // A long fight of heat: a Guard that builds Heat doubles the Payoff's reaction every few rounds.
      [
        'ash-sprite',
        'family:Store',
        ['baked-shell'],
        5,
        29_000,
        13_000,
        'tidewing/none kilnmole/baked-shell tempestray/none',
      ],
      // Its hide Blocks small hits: Sense Weakness gets the Payoff's plain hits past it.
      [
        'bramble-hound',
        'family:Pierce',
        ['tunnel-through'],
        4,
        10_000,
        10_000,
        'tidewing/steady-mark magmole/tunnel-through tempestray/detonate',
      ],
      // A Guard beside the Payoff takes the aimed grab; with a third hitter instead, it lands on the strongest.
      [
        'moss-lurker',
        'family:Reach',
        ['wide-reach'],
        5,
        10_000,
        10_000,
        'tidewing/steady-mark tempestray/detonate thornbuck/wide-reach',
        'tidewing/steady-mark tempestray/detonate pyrelynx/none',
      ],
      // No hit deals more than a cap: dodge keeps the team on its feet while it hits often.
      [
        'static-bat',
        'family:Evasion',
        ['zoom'],
        5,
        25_000,
        10_000,
        'voltaro/zoom thornbuck/none tempestray/none',
      ],
      // Sparks everywhere: a row ward cuts every area hit.
      [
        'flicker-swarm',
        'family:Row Ward',
        ['keep-the-heat-in'],
        5,
        20_000,
        13_000,
        'tidewing/steady-mark kilnmole/keep-the-heat-in tempestray/detonate',
      ],
      // It washes every debuff off every third round: a Mired that comes back every round holds it down.
      [
        'bog-toad',
        'family:Debuff',
        ['squelch-song'],
        5,
        15_000,
        13_000,
        'tidewing/none croakmire/squelch-song tempestray/none',
      ],
      // Black, thick and draining: healing is halved and little gets through its armour, so a boost that reaches the far hitter too
      // (Wide Embrace, standing at the end of the line) is worth more than a heal.
      [
        'tar-leech',
        'family:Support shape',
        ['wide-warmth'],
        7,
        14_000,
        10_000,
        'croakmire/wide-warmth tidewing/steady-mark tempestray/detonate',
      ],
      // The gates open on the whole line: Take It All takes the sweeps.
      [
        'drowned-warden',
        'family:Intercept',
        ['catch-the-bolts'],
        7,
        10_000,
        13_000,
        'tidewing/none ohmouse/catch-the-bolts tempestray/none',
      ],
      // Its shell thickens with every reaction: a Mired that comes back every round holds the Molten Shell down.
      [
        'slag-tyrant',
        'family:Debuff',
        ['squelch-song'],
        7,
        8_000,
        10_000,
        'tidewing/steady-mark croakmire/squelch-song tempestray/detonate',
      ],
      // She silences the ends: a Guard that marks as it takes a hit does the Setter's work.
      [
        'bramble-matron',
        'family:Guard Prime',
        ['primed-by-pain'],
        7,
        8_000,
        10_000,
        'tidewing/none thornbuck/primed-by-pain pyrelynx/none',
      ],
      // A race against a charge that builds: Heat doubles the reactions.
      [
        'coil-baron',
        'family:Store',
        ['baked-shell'],
        7,
        10_000,
        10_000,
        'tidewing/none kilnmole/baked-shell tempestray/none',
      ],
      // A heavy sweep announced at round start: Night Watch takes the first Wind-up hit of each boss turn.
      [
        'fen-lurker',
        'family:Intercept',
        ['night-watch'],
        7,
        9_000,
        10_000,
        'tidewing/none thornbuck/night-watch tempestray/none',
      ],
    ] as const
  ).map(
    ([foe, mechanic, tool, depth, hpBp, atkBp, team, ...rest]) =>
      [
        foe,
        {
          foe,
          mechanic,
          tool,
          depth,
          hpBp,
          atkBp,
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

/** The foe at the question's depth with its HP and Attack scaled. */
export function questionFoe(q: FoeQuestion) {
  const base = foeAt(q.foe, q.depth);
  return {
    ...base,
    hp: Math.max(1, Math.round((base.hp * q.hpBp) / 10_000)),
    atk: Math.max(1, Math.round((base.atk * q.atkBp) / 10_000)),
  };
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
