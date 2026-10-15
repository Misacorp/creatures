import { parseArgs } from 'node:util';
import { RULES, content, createSeededRng } from '@creatures/game';
import { chooseSignUps, type Snapshot } from './economy';
import { openRaidWeek, playWholeWeek, summarizeRaid } from './raid';
import { defaultSettings, runEconomies } from './run';
import { clonePlayer } from './state';

// The test tsconfig has no Node types; both globals exist in Node.
declare const console: { log(text: string): void; error(text: string): void };

/**
 * Cinder Wyrm reflect review (docs/design/attack-patterns.md risk 4, slice 4). Misa decides whether
 * Backdraft changes; this measures the options without changing the engine:
 *
 * - (a) leave it: the reflected hit is the whole reaction bonus and nothing softens it;
 * - (b) cap the reflected hit at a share of the payoff's max HP, with the Wyrm's HP raised until its
 *   typical finale win rate is back to (a)'s;
 * - (c) a living Guard right beside the payoff takes the backlash instead.
 *
 * The variants are switched through `globalThis.__reflectStudy`, which only `scripts/reflect-study.mjs`
 * (a Vite plugin that rewrites the reflect line while the engine loads) makes the engine read. Run
 * under a plain loader the switch does nothing and every variant equals (a), so the CLI refuses to
 * report unless it sees the switch change the result.
 */
type Variant = { mode: 'shipped' } | { mode: 'cap'; capBp: number } | { mode: 'guard' };

interface Measure {
  runs: number;
  winRate: number;
  koShare: number;
  enrageShare: number;
  fifteenWin: number | null;
}

const wyrm = (): (typeof content.bosses)[number] => {
  const b = content.bosses.find((x) => x.id === 'cinder-wyrm');
  if (b === undefined) throw new Error('no Cinder Wyrm in content');
  return b;
};

function setSwitch(v: Variant): void {
  (globalThis as { __reflectStudy?: unknown }).__reflectStudy = v;
}

/** The Wyrm's typical finale (5 to 10 signed up) at a HP scale, under a variant, on the sweep's rosters. */
function measure(
  variant: Variant,
  hpScale: number,
  seed: string,
  runs: number,
  snapshots: ReadonlyMap<number, readonly Snapshot[]>,
): Measure {
  const boss = wyrm();
  const baseHp = boss.baseHp;
  boss.baseHp = Math.round(baseHp * hpScale);
  setSwitch(variant);
  try {
    let n = 0;
    let wins = 0;
    let ko = 0;
    let creatures = 0;
    let enraged = 0;
    let fifteen = 0;
    let fifteenWins = 0;
    for (const count of [5, 10, 15]) {
      const snaps = snapshots.get(count) ?? [];
      if (snaps.length === 0) continue;
      for (let i = 0; i < runs; i++) {
        const snap = snaps[i % snaps.length] as Snapshot;
        const base = `${seed}:reflect:${String(count)}:${String(i)}`;
        const signed = chooseSignUps(
          snap.players.map(clonePlayer),
          createSeededRng(`${base}:signup`),
          createSeededRng(`${base}:order`),
        );
        if (signed.length === 0) continue;
        const week = openRaidWeek(boss, signed, { luck: RULES.combat.luck });
        playWholeWeek(week, createSeededRng(`${base}:fight`), createSeededRng(`${base}:loot`));
        const s = summarizeRaid(week);
        if (s.signedUp === 15 || count === 15) {
          fifteen += 1;
          if (s.finaleWon) fifteenWins += 1;
        }
        if (s.signedUp < 5 || s.signedUp > 10) continue;
        n += 1;
        if (s.finaleWon) wins += 1;
        ko += s.finale.knockedOut;
        creatures += s.finale.creatures;
        if (s.finale.enraged) enraged += 1;
      }
    }
    return {
      runs: n,
      winRate: n === 0 ? 0 : wins / n,
      koShare: creatures === 0 ? 0 : ko / creatures,
      enrageShare: n === 0 ? 0 : enraged / n,
      fifteenWin: fifteen === 0 ? null : fifteenWins / fifteen,
    };
  } finally {
    boss.baseHp = baseHp;
    setSwitch({ mode: 'shipped' });
  }
}

const pct = (x: number | null): string => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

const defaultIo: Io = {
  out: (text) => {
    console.log(text);
  },
  err: (text) => {
    console.error(text);
  },
};

const USAGE =
  'Usage: node packages/sim/scripts/reflect-study.mjs [--seed leet] [--runs 150] [--econ 12] [--cap 8000]';

export function main(argv: readonly string[], io: Io = defaultIo): number {
  let values: ReturnType<typeof parseArgs>['values'];
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        seed: { type: 'string' },
        runs: { type: 'string' },
        econ: { type: 'string' },
        cap: { type: 'string' },
        help: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    }));
    if (values['help'] === true) throw new Error(USAGE);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const seed = typeof values['seed'] === 'string' ? values['seed'] : 'leet';
  const runs = Number(typeof values['runs'] === 'string' ? values['runs'] : 150);
  const econ = Number(typeof values['econ'] === 'string' ? values['econ'] : 12);
  const capBp = Number(typeof values['cap'] === 'string' ? values['cap'] : 8000);
  if (!Number.isInteger(runs) || runs < 1 || runs > 2000) {
    io.err('--runs must be 1 to 2000');
    return 2;
  }
  if (!Number.isInteger(econ) || econ < 1 || econ > 40 || !Number.isInteger(capBp) || capBp < 1) {
    io.err('--econ must be 1 to 40 and --cap a whole number of basis points');
    return 2;
  }
  const settings = { ...defaultSettings('full', { seed }), economySims: econ };
  const { snapshots } = runEconomies(settings, { baseline: false });

  const a = measure({ mode: 'shipped' }, 1, seed, runs, snapshots);
  const b0 = measure({ mode: 'cap', capBp }, 1, seed, runs, snapshots);
  const c = measure({ mode: 'guard' }, 1, seed, runs, snapshots);
  if (b0.winRate === a.winRate && b0.koShare === a.koShare && c.koShare === a.koShare) {
    io.err(
      'the study switch changed nothing: run this through scripts/reflect-study.mjs (the engine is not patched)',
    );
    return 1;
  }
  // (b): raise the Wyrm's HP until its win rate is (a)'s again. The win rate falls as HP grows.
  let low = 1;
  let high = 2;
  for (let k = 0; k < 9; k++) {
    const mid = (low + high) / 2;
    if (measure({ mode: 'cap', capBp }, mid, seed, runs, snapshots).winRate > a.winRate) low = mid;
    else high = mid;
  }
  const scale = (low + high) / 2;
  const b = measure({ mode: 'cap', capBp }, scale, seed, runs, snapshots);
  // (c) with the same hold: a Guard taking the backlash lifts the win rate too.
  let cLow = 1;
  let cHigh = 2;
  for (let k = 0; k < 9; k++) {
    const mid = (cLow + cHigh) / 2;
    if (measure({ mode: 'guard' }, mid, seed, runs, snapshots).winRate > a.winRate) cLow = mid;
    else cHigh = mid;
  }
  const cScale = (cLow + cHigh) / 2;
  const cHeld = measure({ mode: 'guard' }, cScale, seed, runs, snapshots);

  const base = wyrm().baseHp;
  const row = (label: string, m: Measure, hp: string): string =>
    `| ${label} | ${hp} | ${pct(m.winRate)} | ${pct(m.koShare)} | ${pct(m.enrageShare)} | ${pct(m.fifteenWin)} |`;
  io.out(`Cinder Wyrm reflect study (seed ${seed}, ${String(a.runs)} typical finales per row)`);
  io.out(
    '| Option | Wyrm HP | Typical finale win | Creatures knocked out | Reached enrage | 15 players win |',
  );
  io.out('| --- | --- | --- | --- | --- | --- |');
  io.out(row('(a) leave Backdraft', a, `x1.000 (${String(base)})`));
  io.out(row(`(b) cap at ${String(capBp / 100)}% of max HP, same HP`, b0, 'x1.000'));
  io.out(
    row(
      `(b) cap at ${String(capBp / 100)}%, HP raised to hold (a)'s win rate`,
      b,
      `x${scale.toFixed(3)} (${String(Math.round(base * scale))})`,
    ),
  );
  io.out(row('(c) adjacent Guard takes the backlash, same HP', c, 'x1.000'));
  io.out(
    row(
      "(c) adjacent Guard takes the backlash, HP raised to hold (a)'s win rate",
      cHeld,
      `x${cScale.toFixed(3)} (${String(Math.round(base * cScale))})`,
    ),
  );
  return 0;
}
