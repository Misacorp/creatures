/**
 * Combat v2 lab: the content the fight rules read. The rules themselves (R1 to R22: dodge and Guards, marks and reactions, silence,
 * Support verbs, escalation, the weekend, ...) are proved in the engine tests (`packages/engine/test/v2-*.test.ts`) on hand-built
 * creatures that name their effects directly. What stays here is the catalogue: which Knack and talent has which effect, that a form can
 * equip its Knacks, line pools, keywords, names and what the resolver hands to the engine.
 */
import { content, createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  KEYWORDS,
  KNACKS,
  FORM_KNACKS,
  keywordsIn,
  ADDITIVE_FIELDS,
  LINE_POOLS,
  OWN_KNACKS,
  knacksOf,
  lineRoles,
  FAMILIES,
  TALENTS,
  TALENT_LINES,
  card,
  labBoss,
  fight,
  formStats,
  placeFighters,
  talentPool,
  type KnackFx,
  type Placement,
} from '../src';

const at = (
  formId: string,
  row: number,
  col: number,
  knack?: string,
  talents?: string[],
): Placement => ({
  owner: 'p1',
  formId,
  level: 25,
  row,
  col,
  ...(knack ? { knack } : {}),
  ...(talents ? { talents } : {}),
});
const rng = (s: string) => createSeededRng(s);

describe('the effects the engine rule tests name directly (the catalogue gives them)', () => {
  // The engine proves each rule on a creature that carries the effect itself; this is the link back to the Knack or talent that has it.
  // A number may be retuned, so only that the effect is set is asserted.
  const knacks: [string, keyof KnackFx][] = [
    ['draw-fire', 'taunt'],
    ['zoom', 'retaliateBp'],
    ['leave-a-trail', 'trail'],
    ['double-mark', 'markStacks'],
    ['all-at-once', 'minStacks'],
    ['twin-strike', 'twinStrikeBp'],
    ['sunbeam', 'support'],
    ['curl-up', 'support'],
    ['drizzle', 'support'],
    ['starlight', 'support'],
    ['clear-skies', 'support'],
    ['night-watch', 'interceptCharged'],
    ['catch-the-bolts', 'interceptArea'],
    ['carry-them', 'interceptLikeGuard'],
    ['lantern-glow', 'besideNoSilence'],
    ['hide-in-mist', 'besideDodgeBp'],
    ['guards-shadow', 'besideGuardBp'],
    ['territorial', 'alonePayoffBp'],
    ['primed-by-pain', 'primeOnIntercept'],
    ['baked-shell', 'bakedShell'],
    ['squelch-song', 'miresAtStart'],
    ['cool-head', 'critWardBp'],
    ['wild-swing', 'critChanceBp'],
    ['keep-the-heat-in', 'rowAreaCutBp'],
    ['wide-reach', 'reachBonus'],
    ['night-watch', 'watchCutBp'],
  ];
  const talents: [string, keyof KnackFx][] = [
    ['sharp-claws', 'atkBp'],
    ['catch-breath', 'secondWindBp'],
    ['stubborn', 'holdOn'],
    ['hardy', 'hpBp'],
    ['unbothered', 'ignoreSilence'],
    ['shoulder-charge', 'interceptHitBackBp'],
    ['perfect-timing', 'dodgeCritBp'],
    ['hold-the-line', 'guardCritBp'],
    ['steady-rhythm', 'steadyRhythm'],
    ['cull', 'cullBp'],
    ['front-liner', 'frontCutBp'],
    ['brace', 'braceBp'],
    ['flank-guard', 'flankGuard'],
    ['long-shadow', 'distanceCoverBp'],
    ['clinging', 'clinging'],
    ['heavy-hand', 'miredExtraBp'],
    ['shoulder-to-shoulder', 'perKindredBesideBp'],
    ['odd-one-out', 'oddOneOutBp'],
    ['edge-walker', 'rowEndBp'],
    ['slow-burn', 'slowBurnBp'],
    ['finisher', 'finisherBp'],
    ['momentum', 'momentumBp'],
    ['rally-cry', 'vengefulBp'],
    ['opportunist', 'cashHighBp'],
    ['quick-draw', 'freshMarkBp'],
    ['owners-mark', 'ownMarkBp'],
    ['deep-ink', 'firstMarkExtra'],
    ['bright-boost', 'brightBoost'],
    ['kindred-boost', 'kindredBoostBp'],
    ['triage', 'triageBp'],
    ['overheal-spill', 'spillOver'],
    ['first-pounce', 'firstHitBp'],
    ['crit-chance', 'critChanceBp'],
    ['crit-damage', 'critDamageBp'],
  ];

  it('every Knack the rule tests name has its effect', () => {
    for (const [id, key] of knacks) expect(KNACKS[id]?.fx[key], `${id} ${key}`).toBeTruthy();
  });

  it('every talent the rule tests name has its effect', () => {
    for (const [id, key] of talents) expect(TALENTS[id]?.fx[key], `${id} ${key}`).toBeTruthy();
  });

  it('the rule cards put their rule on the boss', () => {
    const b = labBoss({ rows: 1, cols: 1 });
    expect(card('fizzle').apply(b).mods.fizzle).toBe(true);
    expect(card('clean-scales').apply(b).mods.shedMarks).toBe(true);
    expect(card('shake-it-off').apply(b).mods.shakeEvery).toBeGreaterThan(0);
    expect(card('reflective-hide').apply(b).mods.reflectFirst).toBe(true);
    expect(card('adapts').apply(b).mods.adapts).toBe(true);
    expect(card('adapts-element').apply(b).mods.adaptsElement).toBe(true);
    expect(card('stone-skin').apply(b).mods.capPerHit).toBeGreaterThan(0);
    expect(card('wither').apply(b).mods.healBp).toBeLessThan(10_000);
  });
});

describe('the resolver (placement to the creature the engine takes)', () => {
  it("a talent's Max HP line is set when the fight starts: Max HP is a stat, so silence does not take it away", () => {
    const [plain, hardy] = placeFighters([
      at('tidewing', 0, 0),
      at('tidewing', 0, 1, undefined, ['hardy']),
    ]);
    expect(plain?.maxHp).toBe(formStats('tidewing', 25).hp);
    expect(hardy?.maxHp).toBe(
      Math.floor(
        (formStats('tidewing', 25).hp * (10_000 + (TALENTS['hardy']?.fx.hpBp ?? 0))) / 10_000,
      ),
    );
    expect(hardy?.maxHp).toBeGreaterThan(plain?.maxHp ?? 0);
  });

  it('a creature is named by its owner, form and place in the line, and a Support shape Knack leaves Triage idle', () => {
    const [a, b] = placeFighters([
      at('tidewing', 0, 0),
      at('lanternfin', 0, 1, 'curl-up', ['triage']),
    ]);
    expect(a?.uid).toBe('p1:tidewing:0');
    expect(b?.uid).toBe('p1:lanternfin:1');
    expect(b?.triageIdle).toBe(true);
    expect(placeFighters([at('lanternfin', 0, 0, 'gather-calm', ['triage'])])[0]?.triageIdle).toBe(
      false,
    );
    expect(placeFighters([at('lanternfin', 0, 0, undefined, ['triage'])])[0]?.triageIdle).toBe(
      false,
    );
  });

  it('Double Mark marks x2 on the Setters that can equip it', () => {
    for (const form of ['zipmouse', 'voltaro']) {
      const r = fight(
        {
          ...labBoss({ rows: 1, cols: 1, rounds: 1 }),
          spd: 0,
          plain: { ...labBoss({ rows: 1, cols: 1 }).plain, powerBp: 0 },
        },
        [at(form, 0, 0, 'double-mark')],
        { rng: rng('oc'), log: true },
      );
      expect(
        r.events.filter((e) => e.kind === 'mark').map((e) => e.text),
        form,
      ).toEqual(['spark x2']);
    }
  });
});

describe('combat v2 content rules', () => {
  it('every keyword used in Knack text exists in the keyword list', () => {
    for (const k of Object.values(KNACKS))
      for (const w of keywordsIn(k.text)) expect(KEYWORDS, `${k.id} uses {${w}}`).toHaveProperty(w);
  });

  it('every Knack a form lists exists, and no two Knacks share a name (same effect, same name)', () => {
    for (const ks of Object.values(FORM_KNACKS))
      for (const id of ks) expect(KNACKS).toHaveProperty(id);
    const names = Object.values(KNACKS).map((k) => k.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every Knack belongs to a defined family (P-09)', () => {
    for (const k of Object.values(KNACKS)) expect(FAMILIES, k.id).toHaveProperty(k.family);
  });

  it('every Knack states its design intent', () => {
    for (const k of Object.values(KNACKS)) expect(k.intent.length, k.id).toBeGreaterThan(10);
  });
});

describe('combat v2 content rules: Knacks and talents for every species', () => {
  it('every creature form has Knacks', () => {
    for (const c of content.creatures) expect(FORM_KNACKS, c.id).toHaveProperty(c.id);
  });

  it('every talent pool entry exists, and every line has a pool', () => {
    const lines = new Set(content.creatures.map((c) => c.line));
    expect(new Set(TALENT_LINES)).toEqual(lines);
    for (const ln of TALENT_LINES)
      for (const e of talentPool(ln))
        expect(TALENTS, `${ln}: ${e.talent}`).toHaveProperty(e.talent);
  });

  it('talents add only, and never repeat a Knack (P-06)', () => {
    for (const t of Object.values(TALENTS)) {
      for (const key of Object.keys(t.fx))
        expect(ADDITIVE_FIELDS.has(key as keyof KnackFx), `${t.id}: ${key}`).toBe(true);
      const keys = Object.keys(t.fx).sort().join();
      for (const k of Object.values(KNACKS))
        expect(Object.keys(k.fx).sort().join(), `${t.id} repeats ${k.id}`).not.toBe(keys);
    }
  });

  it('talent names are unique, never reuse a Knack name, and their keywords exist', () => {
    const names = [...Object.values(TALENTS), ...Object.values(KNACKS)].map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of Object.values(TALENTS)) {
      expect(t.intent.length, t.id).toBeGreaterThan(10);
      for (const w of keywordsIn(t.text)) expect(KEYWORDS, `${t.id} uses {${w}}`).toHaveProperty(w);
    }
  });
});

describe('R11 and line talent pools (Misa, 2026-10-27)', () => {
  it('evolving adds the new form its own Knacks; a role change keeps only the new role', () => {
    // Splashet (Setter) to Tidewing (Setter): it keeps Steady Mark and Lead the Way, and learns more.
    expect(knacksOf('tidewing')).toEqual([
      'steady-mark',
      'lead-the-way',
      'double-mark',
      'circle-round',
    ]);
    // Splashet to Geyserpup (Payoff): only the Payoff's own.
    expect(knacksOf('geyserpup')).toEqual(OWN_KNACKS['geyserpup']);
    for (const c of content.creatures) expect(OWN_KNACKS, c.id).toHaveProperty(c.id);
  });

  it('every line has a pool of 7 talents, at least 3 of them fit each role in the line', () => {
    for (const ln of new Set(content.creatures.map((c) => c.line))) {
      const pool = LINE_POOLS[ln] ?? [];
      expect(pool.length, ln).toBe(7);
      expect(new Set(pool).size, ln).toBe(7);
      for (const role of lineRoles(ln))
        expect(
          pool.filter((t) => TALENTS[t]?.roles.includes(role)).length,
          `${ln} ${role}`,
        ).toBeGreaterThanOrEqual(3);
    }
  });
});
