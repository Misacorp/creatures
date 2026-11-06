/**
 * The three-piece set effects of combat v2 (gear plan OPEN 5), measured: a fixed team against one track boss, seeded fights, with and
 * without the set on a creature it fits. Printed by `node scripts/sets.mjs`; not part of the default report and asserted by nothing (the
 * rules are proven in the engine's tests). The team and the boss's HP are fixed, so a number differs between rows only by the set.
 *
 * Deep Tracks (First Footprints) is shown with 0, 1, 2 and 4 wearers among four Setters that leave the same element's mark, against a
 * Detonate Payoff and against an All In Payoff, with the boss's peak mark stacks. The other four sets: one line each.
 */
import { SET_THREE_V2, createSeededRng } from '@creatures/game';
import { fight } from './fight';
import { slotBoss } from './track';
import type { Placement } from './types';

/** The slot of the track the fights play (a mid slot). */
export let MEASURE_SLOT = 8;
/** Sets the slot and the boss's HP factor the fights use (the script's arguments). */
export function setBoss(slot: number, hpFactor: number): void {
  MEASURE_SLOT = slot;
  HP_FACTOR = hpFactor;
}
/** The boss's HP is this many times the slot's, so that the team does not kill it and the damage dealt stays a measure. */
export let HP_FACTOR = 4;
const LEVEL = 30;

interface Seat {
  readonly form: string;
  readonly knack?: string;
  readonly gear?: Placement['gear'];
}

/** The seats of a team, placed left to right along the boss's rows. */
function place(seats: readonly Seat[], rows: number, cols: number): Placement[] {
  return seats.map((s, i) => ({
    owner: `p${i + 1}`,
    formId: s.form,
    level: LEVEL,
    knack: s.knack ?? 'none',
    ...(s.gear === undefined ? {} : { gear: s.gear }),
    row: Math.floor(i / cols) % rows,
    col: i % cols,
  }));
}

export interface Row {
  readonly damage: number;
  readonly share: number;
  readonly kills: number;
  readonly peak: number;
  readonly wipes: number;
  readonly reactions: number;
  readonly seeds: number;
}

/** Fights `seeds` seeded fights of the team and returns the mean damage, the share of the boss's HP, kills and the peak mark. */
export function measure(seats: readonly Seat[], seeds: number, salt: string): Row {
  const base = slotBoss(MEASURE_SLOT);
  const boss = { ...base, hp: base.hp * HP_FACTOR };
  const placements = place(seats, boss.rows, boss.cols);
  let damage = 0;
  let kills = 0;
  let peak = 0;
  let wipes = 0;
  let reactions = 0;
  for (let i = 0; i < seeds; i++) {
    const res = fight(boss, placements, { rng: createSeededRng(`sets:${salt}:${i}`), log: true });
    damage += res.damage;
    if (res.won) kills++;
    if (res.wiped) wipes++;
    reactions += res.reactions;
    for (const e of res.events) {
      const b = (e as { board?: { type: string; stacks?: number } }).board;
      if (b?.type === 'mark' && typeof b.stacks === 'number') peak = Math.max(peak, b.stacks);
    }
  }
  return {
    damage: damage / seeds,
    share: damage / seeds / boss.hp,
    kills,
    peak,
    wipes,
    reactions: reactions / seeds,
    seeds,
  };
}

const fx = (id: string) => SET_THREE_V2[id]?.fx;

/** The text report. */
export function setsReport(seeds: number): string[] {
  const base = slotBoss(MEASURE_SLOT);
  const boss = { ...base, hp: base.hp * HP_FACTOR };
  const out: string[] = [
    `Boss: track slot ${MEASURE_SLOT} (${boss.name}, ${boss.hp} HP = ${HP_FACTOR} x the slot's, ${boss.rows} x ${boss.cols} arena), level ${LEVEL} creatures, ${seeds} seeds.`,
    '',
    'Deep Tracks (First Footprints): 8 creatures fill the arena: four Setters leave the same mark (Wickat, ember), two Payoffs cash it (tide), a Guard and a Support stand with them.',
    '',
    '| Payoff | Wearers | Boss HP dealt | Share of boss HP | Kills | Wipes | Reactions | Peak mark |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  const payoffs: [string, string][] = [
    ['Detonate (Coralynx)', 'detonate'],
    ['All In (Geyserpup)', 'all-at-once'],
  ];
  for (const [name, knack] of payoffs) {
    for (const wearers of [0, 1, 2, 4]) {
      const form = knack === 'detonate' ? 'coralynx' : 'geyserpup';
      const seats: Seat[] = [
        ...[0, 1, 2, 3].map((i) => ({
          form: 'wickat',
          ...(i < wearers ? { gear: fx('first-footprints') } : {}),
        })),
        ...[0, 1].map(() => ({ form, knack })),
        { form: 'thornbuck', knack: 'night-watch' },
        { form: 'ashmole', knack: 'wide-warmth' },
      ];
      const r = measure(seats, seeds, `deep:${knack}`);
      out.push(
        `| ${name} | ${wearers} | ${Math.round(r.damage)} | ${(100 * r.share).toFixed(1)}% | ${r.kills}/${r.seeds} | ${r.wipes}/${r.seeds} | ${r.reactions.toFixed(1)} | x${r.peak} |`,
      );
    }
  }
  out.push('', 'The other four sets, on a creature they fit, against the same boss:', '');
  out.push(
    '| Set | Creature | Without | With | Difference |',
    '| --- | --- | ---: | ---: | ---: |',
  );
  const line = (set: string, who: string, base: Seat[], idx: number, id: string) => {
    const without = measure(base, seeds, `line:${id}`);
    const gear = fx(id);
    const withSet = measure(
      base.map((s, i) => (i === idx ? { ...s, gear } : s)),
      seeds,
      `line:${id}`,
    );
    const d = withSet.share - without.share;
    out.push(
      `| ${set} | ${who} | ${(100 * without.share).toFixed(1)}% | ${(100 * withSet.share).toFixed(1)}% | ${d >= 0 ? '+' : ''}${(100 * d).toFixed(1)} pts |`,
    );
  };
  const tideSetters: Seat[] = [0, 1, 2].map(() => ({ form: 'tidewing', knack: 'double-mark' }));
  const emberSetters: Seat[] = [0, 1, 2].map(() => ({ form: 'wickat', knack: 'double-mark' }));
  const sparkSetters: Seat[] = [0, 1, 2].map(() => ({ form: 'zipmouse', knack: 'double-mark' }));
  const crew: Seat[] = [
    { form: 'thornbuck', knack: 'wide-reach' },
    { form: 'ashmole', knack: 'wide-warmth' },
  ];
  line(
    "Warden's Watch",
    'Guard with Wide Reach',
    [...emberSetters, { form: 'coralynx', knack: 'detonate' }, ...crew],
    4,
    'wardens-watch',
  );
  line(
    'Hollow Weave',
    'Grove Payoff (Gaiadrake, Detonate)',
    [...sparkSetters, { form: 'gaiadrake', knack: 'detonate' }, ...crew],
    3,
    'hollow-weave',
  );
  line(
    'Ridge Copper',
    'Spark Payoff (Stormray, Leave a Trail)',
    [...tideSetters, { form: 'stormray', knack: 'leave-a-trail' }, ...crew],
    3,
    'ridge-copper',
  );
  line(
    'Hearth Helpers',
    'Support with Wide Embrace',
    [...emberSetters, { form: 'coralynx', knack: 'detonate' }, ...crew],
    5,
    'hearth-helpers',
  );
  return out;
}
