/**
 * The tools the Undercroft report compares (`undercroftTools.ts`; Misa, 2026-11-05: "what other tools do we have to make it easier past stage 40?").
 * Each is a setting of the lab's dungeon days, in the lab only: nothing is written to game data. `today` is the baseline.
 *
 * What the game has today: a camp is one choice (Swap a knocked-out creature for a bench one, take a keepsake, or Rest: standing creatures
 * recover `RULES.dungeon.camp.restBp`, 40% of max HP). The Undercroft has no camp of its own: only a carved door can add one (a `camp` mark,
 * 15% of the marks, a room before the keeper), and the lab's runs carry no marks. A camp node of a skill tree is therefore a hypothetical
 * that puts the game's own camp on the level's path (`RunOptions.levelCamp`).
 */
import type { DaysConfig } from './dungeonDays';
import type { FoeKnobs } from './dungeonKnobs';
import type { Mode } from './search';

export interface Tool {
  readonly id: string;
  readonly group: string;
  readonly note: string;
  /** What is hypothetical or approximate in it. */
  readonly caveat?: string;
  readonly config: Partial<DaysConfig>;
}

/** Foe HP times 4/3 on the base floors and the Undercroft (a team of four faces the HP per creature of a team of three). */
const FOUR_FAIR: FoeKnobs = { base: { hpMult: 13_333 }, undercroft: { hpMult: 13_333 } };
/** One row of four (`fourSlot.ts`, "four wide"). */
const FOUR_WIDE: Mode = { id: 'gauntlet', rows: 1, cols: 4, maxCopies: 1 };

const CAMP = "A camp in level 1 (the game's camp)";
const HEAL = 'A camp that also heals';
const COMBO = 'Tools together';
const GEAR = 'Better gear (approximation)';

export const TOOLS: readonly Tool[] = [
  {
    id: 'today',
    group: 'Baseline',
    note: 'the game as it is (no camp in the Undercroft)',
    config: {},
  },
  {
    id: 'camp-first',
    group: CAMP,
    note: 'a camp after the first floor of level 1',
    config: { runOptions: { levelCamp: { at: 'first' } } },
  },
  {
    id: 'camp-middle',
    group: CAMP,
    note: 'a camp after the middle floor of level 1',
    config: { runOptions: { levelCamp: { at: 'middle' } } },
  },
  {
    id: 'camp-keeper',
    group: CAMP,
    note: "a camp in its own room before the keeper (what the game's carved-door camp mark draws)",
    config: { runOptions: { levelCamp: { at: 'keeper' } } },
  },
  {
    id: 'camp-middle-both',
    group: HEAL,
    note: 'the middle camp: a swap or a keepsake and also a Rest (40%)',
    caveat: "hypothetical: the game's camp is one choice",
    config: { runOptions: { levelCamp: { at: 'middle', both: true } } },
  },
  {
    id: 'camp-keeper-both',
    group: HEAL,
    note: 'the camp before the keeper: a swap or a keepsake and also a Rest (40%)',
    caveat: "hypothetical: the game's camp is one choice",
    config: { runOptions: { levelCamp: { at: 'keeper', both: true } } },
  },
  {
    id: 'camp-keeper-full',
    group: HEAL,
    note: 'the camp before the keeper: a swap or a keepsake and also a Rest that heals 100%',
    caveat: "hypothetical: the game's Rest is 40% and the camp one choice",
    config: { runOptions: { levelCamp: { at: 'keeper', both: true, restBp: 10_000 } } },
  },
  {
    id: 'bench-plus-1',
    group: 'A bigger bench',
    note: 'one more creature on the bench (a planner has three, a casual player none)',
    config: { extraBench: 1 },
  },
  {
    id: 'gear-5',
    group: GEAR,
    note: "the team's HP and Attack +5%",
    caveat:
      'approximation: a flat bump through the foe (HP and Attack each divided by 1.05), on every room of the run',
    config: { runOptions: { teamBumpBp: 500 } },
  },
  {
    id: 'gear-10',
    group: GEAR,
    note: "the team's HP and Attack +10%",
    caveat:
      'approximation: a flat bump through the foe (HP and Attack each divided by 1.10), on every room of the run',
    config: { runOptions: { teamBumpBp: 1_000 } },
  },
  {
    id: 'four-slots',
    group: 'Four slots',
    note: "a row of four (the bench's first creature joins; a casual player's fourth best), foe HP x 4/3",
    caveat: 'the foes are the same otherwise; one boss turn a round',
    config: { slots: 4, foes: FOUR_FAIR, runOptions: { mode: FOUR_WIDE } },
  },
  {
    id: 'soften-half',
    group: 'A softer curve',
    note: "the Undercroft's depth-squared term halved (+1 bp a depth squared, not 2)",
    config: { foes: { undercroft: { curve: { hpCurveBp: 1 } } } },
  },
  {
    id: 'soften-none',
    group: 'A softer curve',
    note: "the Undercroft's depth-squared term removed (+300 bp a depth, no square)",
    config: { foes: { undercroft: { curve: { hpCurveBp: 0 } } } },
  },
  {
    id: 'combo-camp-gear5',
    group: COMBO,
    note: "the game's camp after the middle floor of level 1, and gear +5%",
    caveat: 'gear is the flat approximation',
    config: { runOptions: { levelCamp: { at: 'middle' }, teamBumpBp: 500 } },
  },
  {
    id: 'combo-camp-gear10',
    group: COMBO,
    note: "the game's camp after the middle floor of level 1, and gear +10%",
    caveat: 'gear is the flat approximation',
    config: { runOptions: { levelCamp: { at: 'middle' }, teamBumpBp: 1_000 } },
  },
  {
    id: 'combo-camp-soft',
    group: COMBO,
    note: "the game's camp after the middle floor of level 1, and the depth-squared term halved",
    config: {
      foes: { undercroft: { curve: { hpCurveBp: 1 } } },
      runOptions: { levelCamp: { at: 'middle' } },
    },
  },
  {
    id: 'back-5',
    group: 'The depth picker',
    note: 'after a wipe the next run is a replay 5 depths below the best (level 1 is read at that lower depth)',
    config: { stepBack: 5 },
  },
  {
    id: 'back-10',
    group: 'The depth picker',
    note: 'after a wipe the next run is a replay 10 depths below the best',
    config: { stepBack: 10 },
  },
];

export const toolOf = (id: string): Tool => {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown undercroft tool ${id}`);
  return t;
};
