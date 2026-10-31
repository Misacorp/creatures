/**
 * Strength (Misa, 2026-10-29): every rule card and boss gate has a strength from 0 to 10000 bp instead of on or off, read by the
 * engine; a card asks for a tool at low strength and requires it at high strength. Boss Rank sets the strengths.
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  CARDS,
  LEVEL,
  RAID_RANKS,
  RAID_SPECS,
  card,
  fight,
  labBoss,
  raidBench,
  raidBossOf,
  raidMode,
  toPlacements,
  weekend,
  type BossDef,
  type Escalation,
  type Placement,
} from '../src';

const at = (formId: string, row: number, col: number, knack?: string): Placement => ({
  owner: 'p1',
  formId,
  level: 25,
  row,
  col,
  ...(knack ? { knack } : {}),
});
const rng = (s: string) => createSeededRng(s);
const withStrength = (b: BossDef, strengthBp: number): BossDef => ({ ...b, strengthBp });
const nums = (texts: readonly string[], re: RegExp): number[] =>
  texts.flatMap((t) => {
    const m = re.exec(t);
    return m ? [Number(m[1])] : [];
  });

describe('strength in the engine', () => {
  it('Reflective Hide returns the card’s strength of the reaction bonus, and the rest lands', () => {
    const base: BossDef = {
      ...labBoss({ rows: 1, cols: 2, rounds: 6, atk: 1 }),
      spd: 0,
      armour: 0,
      mods: { reflectFirst: true },
    };
    const team = [at('tidewing', 0, 0), at('tempestray', 0, 1)];
    const run = (st: number) => {
      const r = fight(withStrength(base, st), team, { rng: rng('reflect'), log: true });
      const back = nums(
        r.events.filter((e) => e.kind === 'reflect').map((e) => e.text),
        /reflects (\d+)/,
      );
      return { back: back[0] ?? 0, damage: r.damage };
    };
    const full = run(10_000);
    const half = run(5_000);
    const none = run(0);
    expect(full.back).toBeGreaterThan(0);
    expect(half.back).toBeGreaterThan(full.back * 0.4);
    expect(half.back).toBeLessThan(full.back * 0.6);
    expect(none.back).toBe(0);
    // What does not bounce lands on the boss: a weaker card costs the team less.
    expect(none.damage).toBeGreaterThan(half.damage);
    expect(half.damage).toBeGreaterThan(full.damage);
  });

  it('Shake It Off clears the card’s strength of the Mired, all of it at full strength', () => {
    const base: BossDef = {
      ...labBoss({ rows: 1, cols: 1, rounds: 1, atk: 1 }),
      spd: 0,
      mods: { shakeEvery: 1 },
    };
    const team = [at('squelch', 0, 0, 'squelch-song')];
    const left = (st: number) => {
      const r = fight(withStrength(base, st), team, { rng: rng('shake'), log: true });
      return nums(
        r.events.filter((e) => e.kind === 'mired').map((e) => e.text),
        /Mired x(\d+)/,
      ).at(-1);
    };
    expect(left(10_000)).toBe(0);
    const three: BossDef = { ...base, rounds: 3, mods: { shakeEvery: 3 } };
    const after = (st: number) => {
      const r = fight(withStrength(three, st), [at('squelch', 0, 0, 'squelch-song')], {
        rng: rng('shake3'),
        log: true,
      });
      return nums(
        r.events.filter((e) => e.kind === 'mired').map((e) => e.text),
        /Mired x(\d+)/,
      ).at(-1);
    };
    expect(after(10_000)).toBe(0);
    expect(after(5_000)).toBeGreaterThan(0);
    // Squelch Song adds three stacks over three rounds and one fades after round 2: none cleared leaves two.
    expect(after(0)).toBe(2);
    expect(after(5_000)).toBe(1);
  });

  it('Reaction Resistance and Element Resistance cut by a share of what they cut at full strength', () => {
    const base: BossDef = {
      ...labBoss({ rows: 1, cols: 2, rounds: 4, atk: 1, hp: 1_000_000 }),
      spd: 0,
      armour: 0,
    };
    const team = [at('kilnmole', 0, 0), at('kilnmole', 0, 1)];
    const second = (b: BossDef) =>
      weekend(b, team, [], { rng: rng('ew'), stages: 2 }).stages[1]?.damage ?? 0;
    const free = second(base);
    const el = (st: number) => second({ ...base, strengthBp: st, mods: { adaptsElement: true } });
    expect(el(0)).toBe(free);
    expect(el(10_000)).toBeLessThan(free * 0.8);
    expect(el(5_000)).toBeLessThan(free);
    expect(el(5_000)).toBeGreaterThan(el(10_000));
    // The element cut is a quarter at full strength, an eighth at half.
    expect(el(5_000) / free).toBeGreaterThan(0.85);
    expect(el(5_000) / free).toBeLessThan(0.9);
  });

  it('a Build-up step grows the boss by the strength’s share', () => {
    const esc: Escalation = {
      name: 'Test Heat',
      feed: 'rounds',
      per: 1,
      cap: 3,
      grow: { atkBp: 10_000, jumps: 2 },
    };
    const base: BossDef = {
      ...labBoss({ rows: 1, cols: 1, rounds: 6, atk: 100 }),
      spd: 0,
      hp: 1_000_000,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
      escalation: esc,
    };
    const taken = (st: number) => {
      const r = fight(withStrength(base, st), [at('hearthshell', 0, 0)], {
        rng: rng('grow'),
        log: true,
      });
      return nums(
        r.events.filter((e) => e.kind === 'hit').map((e) => e.text),
        /takes (\d+)/,
      );
    };
    const full = taken(10_000);
    const half = taken(5_000);
    const none = taken(0);
    // After the cap (round 4 on) the hit is 4x at full strength, 2.5x at half and 1x with none.
    expect(full.at(-1)).toBeGreaterThan((half.at(-1) ?? 0) * 1.2);
    expect(half.at(-1)).toBeGreaterThan((none.at(-1) ?? 0) * 1.2);
    expect(none.at(-1)).toBeGreaterThan(0);
    // A step's own strength overrides the boss's.
    const own = fight(
      withStrength({ ...base, escalation: { ...esc, strengthBp: 0 } }, 10_000),
      [at('hearthshell', 0, 0)],
      { rng: rng('grow'), log: true },
    );
    expect(
      nums(
        own.events.filter((e) => e.kind === 'hit').map((e) => e.text),
        /takes (\d+)/,
      ).at(-1),
    ).toBe(none.at(-1));
  });

  it('a silence hits the strength’s share of its slots and lasts that share of its turns (at least one)', () => {
    const silence = (st: number, turns: number): BossDef => ({
      ...labBoss({ rows: 1, cols: 4, rounds: 1, atk: 1 }),
      spd: 0,
      moves: [
        {
          id: 's',
          name: 'Hush',
          pattern: { anchor: 'front', shape: 'all' },
          powerBp: 0,
          every: 1,
          turn: 0,
          silenceTurns: turns,
          strengthBp: st,
        },
      ],
    });
    const team = [0, 1, 2, 3].map((c) => at('thornbuck', 0, c));
    const silenced = (b: BossDef, seed: string) =>
      fight(b, team, { rng: rng(seed), log: true }).events.filter(
        (e) => e.kind === 'silence' && /is silenced/.test(e.text),
      ).length;
    let full = 0,
      half = 0,
      none = 0;
    for (let i = 0; i < 30; i++) {
      full += silenced(silence(10_000, 2), `h${i}`);
      half += silenced(silence(5_000, 2), `h${i}`);
      none += silenced(silence(0, 2), `h${i}`);
    }
    expect(full).toBe(120);
    expect(none).toBe(0);
    expect(half).toBeGreaterThan(40);
    expect(half).toBeLessThan(80);
  });

  it('a one-shot deals the strength’s share of the target’s Max HP, and a Night Watch or cover still cuts it', () => {
    const bolt = (st: number, oneShotBp = 12_000): BossDef => ({
      ...labBoss({ rows: 1, cols: 1, rounds: 1, atk: 1 }),
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 1 },
      moves: [
        {
          id: 'bolt',
          name: 'Bolt',
          pattern: { anchor: 'payoff', shape: 'single' },
          powerBp: 70_000,
          every: 1,
          turn: 0,
          oneShotBp,
          strengthBp: st,
        },
      ],
    });
    const hit = (st: number) => {
      const r = fight(bolt(st), [at('tempestray', 0, 0)], { rng: rng('bolt') });
      const f = r.fighters[0];
      return { left: f?.hp ?? 0, max: f?.maxHp ?? 0 };
    };
    const full = hit(10_000);
    expect(full.left).toBe(0);
    const half = hit(5_000);
    // 60% of Max HP minus armour 5 (and the plain attack's sliver).
    expect(half.max - half.left).toBeGreaterThan(half.max * 0.55);
    expect(half.max - half.left).toBeLessThan(half.max * 0.61);
    expect(hit(2_000).left).toBeGreaterThan(half.left);
  });

  it('cards built at a strength change their numbers by that share', () => {
    const b = labBoss({ rows: 1, cols: 1 });
    expect(card('thick-hide').apply(b).armour).toBe(b.armour + 70);
    expect(card('thick-hide').apply(b, 5_000).armour).toBe(b.armour + 35);
    expect(card('thick-hide').apply(b, 0).armour).toBe(b.armour);
    expect(card('elusive').apply(b, 5_000).spd).toBe(b.spd + 150);
    expect(card('stone-skin').apply(b).mods.capPerHit).toBe(260);
    expect(card('stone-skin').apply(b, 5_000).mods.capPerHit).toBe(520);
    expect(card('stone-skin').apply(b, 0).mods.capPerHit).toBeUndefined();
    expect(card('wither').apply(b, 5_000).mods.healBp).toBe(7_500);
    expect(card('wither').apply(b, 0).mods.healBp).toBe(10_000);
    const slam = (st: number) =>
      card('payoff-hunter')
        .apply(b, st)
        .moves.find((m) => m.id === 'payoff-slam')?.powerBp;
    expect(slam(10_000)).toBe(15_000);
    expect(slam(5_000)).toBe(7_500);
    // A rule card remembers its strength on the boss for the engine to read.
    expect(card('adapts').apply(b, 4_000).strengthBp).toBe(4_000);
    // Every card builds at full strength by default and at any strength.
    for (const c of CARDS)
      for (const st of [0, 3_000, 10_000]) expect(() => c.apply(b, st)).not.toThrow();
  });
});

describe('Boss Rank in the lab', () => {
  it('a lower rank has softer cards and less armour; its HP and Attack follow the boss’s own ladder', () => {
    for (const spec of RAID_SPECS) {
      const high = raidBossOf(spec.id);
      const mid = raidBossOf(spec.id, { rank: 'mid' });
      const low = raidBossOf(spec.id, { rank: 'low' });
      expect(high.strengthBp).toBe(10_000);
      expect(mid.strengthBp).toBeGreaterThan(low.strengthBp ?? 0);
      expect(high.strengthBp).toBeGreaterThan(mid.strengthBp ?? 0);
      expect(high.hp).toBe(spec.hp);
      expect(high.atk).toBe(spec.atk);
      // The ladder rows are the spec's shares at each lower rank.
      for (const [b, row] of [
        [low, spec.ranks?.low],
        [mid, spec.ranks?.mid],
      ] as const) {
        expect(b.hp).toBe(Math.round((spec.hp * (row?.[0] ?? 10_000)) / 10_000));
        expect(b.atk).toBe(Math.round((spec.atk * (row?.[1] ?? 10_000)) / 10_000));
      }
      expect(low.armour).toBeLessThanOrEqual(mid.armour);
      expect(mid.armour).toBeLessThanOrEqual(high.armour);
      // Half of a boss's armour is its hide, so even the low rank keeps it.
      expect(low.armour).toBeGreaterThanOrEqual(Math.round(spec.armour / 2));
      if (high.escalation) expect(low.escalation?.strengthBp).toBe(low.strengthBp);
    }
    expect(RAID_RANKS.map((r) => r.id)).toEqual(['low', 'mid', 'high']);
    expect(RAID_RANKS.map((r) => r.rank)).toEqual(
      [...RAID_RANKS.map((r) => r.rank)].sort((a, b) => a - b),
    );
  });

  it('every step down the ladder is softer in every respect (Misa, 2026-10-29): HP, Attack, armour, card strength and roster', () => {
    for (const spec of RAID_SPECS) {
      const [low, mid, high] = (['low', 'mid', 'high'] as const).map((rank) =>
        raidBossOf(spec.id, { rank }),
      ) as [BossDef, BossDef, BossDef];
      expect(low.hp, spec.id).toBeLessThan(mid.hp);
      expect(mid.hp, spec.id).toBeLessThan(high.hp);
      expect(low.atk, spec.id).toBeLessThan(mid.atk);
      expect(mid.atk, spec.id).toBeLessThan(high.atk);
      // Clearly softer: the low rank is at least a tenth under the high rank in both, the mid rank under it by some.
      expect(low.hp, spec.id).toBeLessThanOrEqual(high.hp * 0.9);
      expect(low.atk, spec.id).toBeLessThanOrEqual(high.atk * 0.9);
      expect(mid.hp, spec.id).toBeLessThanOrEqual(high.hp * 0.95);
      expect(mid.atk, spec.id).toBeLessThanOrEqual(high.atk * 0.95);
      expect(low.strengthBp, spec.id).toBeLessThan(mid.strengthBp ?? 0);
      expect(low.rosterLevel, spec.id).toBeLessThan(mid.rosterLevel ?? 0);
      expect(mid.rosterLevel, spec.id).toBeLessThan(high.rosterLevel ?? 0);
    }
    expect(RAID_RANKS.at(-1)?.level).toBe(LEVEL);
  });

  it('Thornmother’s bark is thinner at the lower ranks than the card’s share alone would make it', () => {
    const spec = RAID_SPECS.find((s) => s.id === 'thornmother');
    const low = raidBossOf('thornmother', { rank: 'low' });
    expect(spec?.ranks?.low[2]).toBeDefined();
    expect(low.armour).toBe(
      Math.round(((spec?.armour ?? 0) * (spec?.ranks?.low[2] ?? 0)) / 10_000),
    );
    expect(low.armour).toBeLessThan(raidBossOf('thornmother', { rank: 'mid' }).armour);
    expect(raidBossOf('thornmother', { rank: 'mid' }).armour).toBeLessThan(
      raidBossOf('thornmother').armour,
    );
  });

  it('the rank’s roster level reaches every creature the weekend places: the line, the bench and a wide arena', () => {
    const low = raidBossOf('storm-sovereign', { rank: 'low' });
    const high = raidBossOf('storm-sovereign');
    expect(raidMode(low).level).toBe(RAID_RANKS[0]?.level);
    expect(raidMode(high).level).toBe(LEVEL);
    const line = [
      { formId: 'tidewing', knack: 'none' },
      { formId: 'tempestray', knack: 'none', level: 7 },
    ];
    // A pick that names a level keeps it; the others take the rank's.
    expect(toPlacements(line, raidMode(low)).map((p) => p.level)).toEqual([low.rosterLevel, 7]);
    expect(raidBench(4, low.rosterLevel).every((p) => p.level === low.rosterLevel)).toBe(true);
    expect(raidBench(4).every((p) => p.level === LEVEL)).toBe(true);
    // A weaker roster does less damage against the same boss.
    const same = { ...high, hp: 1_000_000 };
    const dmg = (b: BossDef) => {
      const w = weekend(
        b,
        toPlacements(line.slice(0, 1), { ...raidMode(b), cols: 1, rows: 1 }),
        [],
        {
          rng: rng('roster'),
          stages: 1,
        },
      );
      return 1_000_000 - (w.stages[0]?.bossHpLeft ?? 0);
    };
    expect(dmg({ ...same, rosterLevel: 12, rows: 1, cols: 1 })).toBeLessThan(
      dmg({ ...same, rosterLevel: LEVEL, rows: 1, cols: 1 }),
    );
  });

  it('an override replaces the rank’s HP and Attack', () => {
    const b = raidBossOf('old-bogback', { rank: 'low', hp: 1_000, atk: 7 });
    expect(b.hp).toBe(1_000);
    expect(b.atk).toBe(7);
  });
});
