import { combatV2 } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import { DEV_TOOL_IDS, buildBody, initialValues, specId, type ToolSpec } from './forms';
import {
  BASE_OPTIONS,
  BOON_OPTIONS,
  LIMITS,
  OMEN_OPTIONS,
  RANK_OPTIONS,
  SEATS_OPTIONS,
  SPECIES_OPTIONS,
} from './options';
import { ALL_SPECS, CLOCK_SPECS, GOODS_SPECS, SECTIONS, orderedSections } from './specs';

const CREATURES = [
  { id: 'c-1', label: 'Cindle (Lv 3)' },
  { id: 'c-2', label: 'Moss (Lv 1)' },
];

function spec(tool: string, label: string): ToolSpec {
  const found = ALL_SPECS.find((s) => s.tool === tool && s.label === label);
  if (found === undefined) throw new Error(`no control ${tool}: ${label}`);
  return found;
}

function run(tool: string, label: string, values: Record<string, string> = {}) {
  const s = spec(tool, label);
  return buildBody(s, { ...initialValues(s, CREATURES), ...values });
}

function body(tool: string, label: string, values: Record<string, string> = {}): unknown {
  const built = run(tool, label, values);
  if (!built.ok) throw new Error(built.error);
  return built.body;
}

function problem(tool: string, label: string, values: Record<string, string> = {}): string | null {
  const built = run(tool, label, values);
  return built.ok ? null : built.error;
}

const firstSpecies = SPECIES_OPTIONS[0]?.value ?? '';
const firstBase = BASE_OPTIONS[0]?.value ?? '';

describe('every tool has a control', () => {
  it('covers each action tool of the server, and nothing else', () => {
    const covered = new Set<string>(ALL_SPECS.map((s) => s.tool));
    expect(DEV_TOOL_IDS.filter((t) => !covered.has(t))).toEqual([]);
    expect([...covered].filter((t) => !(DEV_TOOL_IDS as readonly string[]).includes(t))).toEqual(
      [],
    );
  });

  it('has unique control ids', () => {
    const ids = ALL_SPECS.map(specId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds a body from the starting values, except where the player must fill something in', () => {
    for (const s of ALL_SPECS) {
      const built = buildBody(s, initialValues(s, CREATURES));
      const needsInput =
        s.needOne === true ||
        s.fields.some((f) => (f.kind === 'int' && f.optional !== true) || f.kind === 'text');
      if (!built.ok) expect(needsInput, `${specId(s)}: ${built.error}`).toBe(true);
    }
  });
});

describe('the dev clock', () => {
  it('sends the amounts and targets the server schema knows', () => {
    expect(CLOCK_SPECS.map((s) => body('clock', s.label))).toEqual([
      { advanceMs: 3_600_000 },
      { advanceMs: 21_600_000 },
      { advanceMs: 86_400_000 },
      { to: 'next-reset' },
      { to: 'next-phase' },
      { reset: true },
    ]);
  });
});

describe('goods', () => {
  it('sets balances, leaving out empty fields', () => {
    expect(body('set-balances', 'Set Bait and Essence', { bait: '500' })).toEqual({ bait: 500 });
    expect(body('set-balances', 'Set Bait and Essence', { bait: '0', essence: '20' })).toEqual({
      bait: 0,
      essence: 20,
    });
    expect(problem('set-balances', 'Set Bait and Essence')).toMatch(/at least one/);
  });

  it('grants parts by the server keys', () => {
    expect(
      body('grant-parts', 'Grant parts', { scrap: '10', 'tide-shard': '2', glimmer: '1' }),
    ).toEqual({
      scrap: 10,
      'tide-shard': 2,
      glimmer: 1,
    });
    expect(GOODS_SPECS.find((s) => s.tool === 'grant-parts')?.fields.map((f) => f.key)).toEqual([
      'scrap',
      'tide-shard',
      'ember-shard',
      'grove-shard',
      'spark-shard',
      'mire-shard',
      'glimmer',
    ]);
  });

  it('grants supplies and blueprints', () => {
    const supply = spec('grant-supplies', 'Grant supplies').fields[0];
    const firstSupply = supply?.kind === 'select' ? supply.options[0]?.value : undefined;
    expect(body('grant-supplies', 'Grant supplies', { amount: '5' })).toEqual({
      supply: firstSupply,
      amount: 5,
    });
    expect(body('grant-blueprints', 'Grant all blueprints')).toEqual({ all: true });
    expect(body('grant-blueprints', 'Grant a blueprint')).toEqual({ baseId: firstBase });
  });

  it('refuses a bad value before sending', () => {
    expect(problem('grant-supplies', 'Grant supplies', { amount: '100' })).toMatch(/Amount/);
    expect(problem('grant-supplies', 'Grant supplies', { amount: '1.5' })).toMatch(/Amount/);
    expect(problem('grant-supplies', 'Grant supplies', { amount: '' })).toMatch(/Amount/);
    expect(problem('grant-supplies', 'Grant supplies', { amount: '2', supply: 'nope' })).toMatch(
      /Supply/,
    );
  });
});

describe('creatures', () => {
  it('grants a species, with the optional fields only when set', () => {
    expect(body('grant-creature', 'Grant a creature')).toEqual({ species: firstSpecies });
    expect(
      body('grant-creature', 'Grant a creature', { shiny: 'true', level: '12', fusion: '0' }),
    ).toEqual({ species: firstSpecies, shiny: true, level: 12, fusion: 0 });
    expect(body('grant-creature', 'Grant a creature', { shiny: 'false' })).toEqual({
      species: firstSpecies,
      shiny: false,
    });
  });

  it('sets a creature by its id, and needs something to set', () => {
    expect(body('set-creature', 'Set level, fusion or evolve', { level: '30' })).toEqual({
      creatureId: 'c-1',
      level: 30,
    });
    expect(
      body('set-creature', 'Set level, fusion or evolve', {
        creatureId: 'c-2',
        species: firstSpecies,
      }),
    ).toEqual({ creatureId: 'c-2', species: firstSpecies });
    expect(problem('set-creature', 'Set level, fusion or evolve')).toMatch(/at least one/);
    expect(problem('set-creature', 'Set level, fusion or evolve', { level: '100' })).toMatch(
      /Level/,
    );
  });

  it('sets explorer values, familiarity and Crafting XP', () => {
    expect(
      body('set-explorer', 'Set explorer rank, XP or trips', { rank: '5', trips: '40' }),
    ).toEqual({
      creatureId: 'c-1',
      rank: 5,
      trips: 40,
    });
    expect(
      problem('set-explorer', 'Set explorer rank, XP or trips', {
        rank: String(LIMITS.maxExplorerRank + 1),
      }),
    ).toMatch(/Rank/);
    const familiarity = body('set-familiarity', 'Set familiarity at a place', {
      trips: '12',
      foundAll: 'true',
    }) as Record<string, unknown>;
    expect(Object.keys(familiarity).sort()).toEqual([
      'creatureId',
      'destination',
      'foundAll',
      'trips',
    ]);
    expect(familiarity['foundAll']).toBe(true);
    expect(body('set-crafting-xp', 'Set Crafting XP', { xp: '900' })).toEqual({
      creatureId: 'c-1',
      xp: 900,
    });
  });

  it('picks the first creature when the chosen one is gone', () => {
    const s = spec('set-crafting-xp', 'Set Crafting XP');
    expect(initialValues(s, [])['creatureId']).toBe('');
    expect(buildBody(s, { creatureId: '', xp: '1' })).toEqual({
      ok: false,
      error: 'Creature: pick a creature',
    });
  });
});

describe('the Workshop', () => {
  it('has no-body buttons and a gear grant', () => {
    expect(body('finish-jobs', 'Finish all jobs now')).toEqual({});
    expect(body('fill-bag', 'Fill the bag')).toEqual({});
    expect(body('grant-gear', 'Grant a gear item', { rarity: 'epic' })).toEqual({
      baseId: firstBase,
      rarity: 'epic',
    });
    expect(body('grant-gear', 'Grant a gear item', { itemLevel: '3' })).toMatchObject({
      itemLevel: 3,
    });
    expect(problem('grant-gear', 'Grant a gear item', { rarity: 'mythic' })).toMatch(/Rarity/);
  });
});

describe('Expeditions', () => {
  it('sends the journal variants', () => {
    expect(body('journal', 'Unlock all journal pages')).toEqual({ action: 'unlock-all' });
    expect(body('journal', 'Reset the journal')).toEqual({ action: 'reset' });
    const unlock = body('journal', 'Unlock a journal page') as Record<string, unknown>;
    expect(unlock['action']).toBe('unlock');
    expect(typeof unlock['entryId']).toBe('string');
  });

  it('forces an offer, night and Festival', () => {
    expect(body('force-offer', 'Force a push-on offer', { outcome: 'fail' })).toEqual({
      outcome: 'fail',
    });
    expect(problem('force-offer', 'Force a push-on offer')).toMatch(/at least one/);
    expect(
      body('force-gates', 'Force night or Festival', { night: 'on', festival: 'auto' }),
    ).toEqual({
      night: 'on',
      festival: 'auto',
    });
  });

  it('sets slots', () => {
    expect(body('set-slots', 'Set slots or the rank sum', { slots: '3', rankSum: '40' })).toEqual({
      slots: 3,
      rankSum: 40,
    });
    expect(problem('set-slots', 'Set slots or the rank sum', { slots: '0' })).toMatch(/Slots/);
  });
});

describe('the Dungeon', () => {
  it('sends depth, landmark, streak and the reset buttons', () => {
    expect(body('dungeon-depth', 'Set depth', { depth: '25' })).toEqual({ depth: 25 });
    expect(body('dungeon-depth', 'Next landmark')).toEqual({ nextLandmark: true });
    expect(body('dungeon-streak', 'Set streak', { streak: '0' })).toEqual({ streak: 0 });
    expect(body('dungeon-reset', "Reset today's run")).toEqual({});
    expect(body('dungeon-retry', 'Force the first-day retry')).toEqual({});
    expect(body('dungeon-seed', "Re-roll the day's seed")).toEqual({});
  });

  it('sends one modifier per room as a list', () => {
    const s = spec('dungeon-modifiers', "Pick the day's modifiers");
    expect(s.fields).toHaveLength(LIMITS.rooms);
    const values: Record<string, string> = {};
    s.fields.forEach((f, i) => {
      values[f.key] = f.kind === 'select' ? (f.options[i]?.value ?? '') : '';
    });
    const built = buildBody(s, values);
    expect(built.ok && built.body).toEqual({
      ids: s.fields.map((_, i) => values[`room${String(i)}`]),
    });
    expect(body('dungeon-modifiers', 'Clear modifiers')).toEqual({ clear: true });
  });
});

describe('the Raid test bench', () => {
  it('lists the steps in the order they are used', () => {
    const raid = SECTIONS.find((s) => s.id === 'raid');
    expect(raid?.ordered).toBe(true);
    expect(raid?.specs.map((s) => s.label)).toEqual([
      'Clear the board',
      'Fill the empty spots',
      'Boss and Boss Rank',
      'Creatures per player',
      'Play stage 1',
      'Play stage 2',
      'Play the finale',
      'Watch the finale live',
      'Combat v2, Convert',
      'Reset raids and dungeons',
    ]);
  });

  it('clears the board with an empty body', () => {
    expect(body('raid-clear', 'Clear the board')).toEqual({});
  });

  it('fills the empty spots: the whole board by default, or 1 to 14 players', () => {
    expect(body('raid-fill', 'Fill the empty spots')).toEqual({});
    expect(body('raid-fill', 'Fill the empty spots', { count: '6' })).toEqual({ count: 6 });
    expect(body('raid-fill', 'Fill the empty spots', { count: '14' })).toEqual({ count: 14 });
    for (const bad of ['0', '15', '2.5', 'x']) {
      expect(problem('raid-fill', 'Fill the empty spots', { count: bad })).toMatch(
        /Simulated players: a whole number from 1 to 14/,
      );
    }
    const field = spec('raid-fill', 'Fill the empty spots').fields[0];
    expect(field).toMatchObject({ placeholder: 'fill the board' });
  });

  it('picks a Boss Rank from a list that names each rank with its boss', () => {
    // The track's ranks, one option each, "Rank 8 · Storm Sovereign" (the boss of slot 8 is the third of the order).
    expect(RANK_OPTIONS).toHaveLength(combatV2.raidTrack.slots.length);
    expect(RANK_OPTIONS.slice(0, 3).map((o) => o.label)).toEqual([
      'Rank 1 \u00b7 Tidal Colossus',
      'Rank 2 \u00b7 Cinder Wyrm',
      'Rank 3 \u00b7 Storm Sovereign',
    ]);
    expect(RANK_OPTIONS.find((o) => o.value === '8')?.label).toBe('Rank 8 \u00b7 Storm Sovereign');
    expect(RANK_OPTIONS.map((o) => o.value)).toEqual(
      combatV2.raidTrack.slots.map((s) => String(s.slot)),
    );
    expect(body('raid-rank', 'Boss and Boss Rank', { rank: '8' })).toEqual({ rank: 8 });
    expect(problem('raid-rank', 'Boss and Boss Rank', { rank: '99' })).toMatch(/pick one/);
  });

  it('sets the creatures per player to a number from 1 to 8, or back to the default (null)', () => {
    expect(SEATS_OPTIONS.map((o) => o.value)).toEqual([
      'default',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ]);
    expect(body('raid-seats', 'Creatures per player')).toEqual({ seats: null });
    expect(body('raid-seats', 'Creatures per player', { seats: '5' })).toEqual({ seats: 5 });
    expect(problem('raid-seats', 'Creatures per player', { seats: '9' })).toMatch(/pick one/);
  });

  it('plays a stage by name, the finale at once or live', () => {
    expect(body('raid-play', 'Play stage 1')).toEqual({ stage: 'stage1' });
    expect(body('raid-play', 'Play stage 2')).toEqual({ stage: 'stage2' });
    expect(body('raid-play', 'Play the finale')).toEqual({ stage: 'finale' });
    expect(body('raid-play', 'Watch the finale live')).toEqual({ stage: 'finale', live: true });
  });

  it('keeps no control of the old raid tools', () => {
    for (const gone of [
      'raid-phase',
      'raid-resolve',
      'raid-boss',
      'raid-festival',
      'raid-roster',
      'raid-live',
      'raid-simulate',
      'raid-weekend',
    ]) {
      expect(DEV_TOOL_IDS as readonly string[]).not.toContain(gone);
    }
  });
});

describe('analytics and the account', () => {
  it('rolls up with an empty body', () => {
    expect(body('analytics-rollup', 'Roll up now')).toEqual({});
  });

  it('resets the account only after RESET is typed', () => {
    expect(problem('reset-account', 'Reset my account')).toMatch(/RESET/);
    expect(problem('reset-account', 'Reset my account', { confirm: 'reset' })).toMatch(/RESET/);
    expect(problem('reset-account', 'Reset my account', { confirm: 'RESET ' })).toMatch(/RESET/);
    expect(body('reset-account', 'Reset my account', { confirm: 'RESET' })).toEqual({
      confirm: 'RESET',
    });
  });
});

describe('the weather tool', () => {
  it('sets today or tomorrow with a Boon, and no Omen unless one is picked', () => {
    const boon = BOON_OPTIONS[0]?.value ?? '';
    expect(body('set-weather', "Set today's sky")).toEqual({ day: 'today', boon, omen: null });
    const omen = OMEN_OPTIONS[1]?.value ?? '';
    expect(body('set-weather', "Set tomorrow's sky", { omen })).toEqual({
      day: 'tomorrow',
      boon,
      omen,
    });
  });

  it('offers the live Boons and Omens (all 10 and 10), and no Omen first', () => {
    expect(BOON_OPTIONS.map((o) => o.value)).toContain('kind-rain');
    expect(OMEN_OPTIONS.map((o) => o.value)).toContain('morning-haze');
    expect(OMEN_OPTIONS.map((o) => o.value)).toContain('bramble-season');
    expect(OMEN_OPTIONS[0]).toEqual({ value: 'none', label: 'No Omen' });
    expect(BOON_OPTIONS.length).toBe(10);
    expect(OMEN_OPTIONS.length).toBe(1 + 10);
  });

  it('refuses a Boon that is not on the list', () => {
    expect(problem('set-weather', "Set today's sky", { boon: 'no-such-boon' })).toMatch(
      /Boon: pick one/,
    );
  });
});

describe('the section order', () => {
  it('puts the current tab first and keeps every section', () => {
    expect(orderedSections('dungeon').map((s) => s.id)).toEqual([
      'dungeon',
      'creatures',
      'workshop',
      'expeditions',
      'games',
      'raid',
      'weather',
      'analytics',
    ]);
    expect(orderedSections('collection')[0]?.id).toBe('creatures');
    expect(orderedSections('raid')).toHaveLength(SECTIONS.length);
  });
});
