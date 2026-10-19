/**
 * Sample raid summaries for the workbench: the after-action stats and rewards of a finale on an
 * 11-player server (cleared, and not cleared), on a 3-player server (cleared in a Festival week, and
 * wiped), and of a phase. Built deterministically from a few hand-written tables, in the shape the
 * server sends (`AfterActionStats`), so the mock-ups are fed by data the game really has.
 */
import type { GrantLoot } from '../gear-types';
import type {
  AfterActionStats,
  StatsAbilityUse,
  StatsAdaptation,
  StatsCreature,
  StatsKnockout,
  StatsOutcome,
  StatsPlayer,
  StatsReaction,
} from '../raid-api';
import type { SummaryInput } from '../raid-summary-view';

interface PlayerSeed {
  name: string;
  /** Relative weight of the player's damage. */
  weight: number;
  /** Credit that is not damage: setting up, supporting, guarding. */
  support: number;
  /** The player's three creatures: species, nickname (or the species name), share of damage in percent. */
  team: readonly (readonly [string, string, number])[];
}

const SPECIES_NAME: Readonly<Record<string, string>> = {
  cindle: 'Cindle',
  pyrelynx: 'Pyrelynx',
  stormray: 'Stormray',
  tempestray: 'Tempestray',
  splashet: 'Splashet',
  tidewing: 'Tidewing',
  sproutle: 'Sproutle',
  thornbuck: 'Thornbuck',
  zipmouse: 'Zipmouse',
  voltaro: 'Voltaro',
  mistnewt: 'Mistnewt',
  ashmole: 'Ashmole',
  coralynx: 'Coralynx',
  mossback: 'Mossback',
  geyserpup: 'Geyserpup',
  bloomback: 'Bloomback',
};

/** A creature of a team: a nickname when given, else the species' own name. */
const c = (
  species: string,
  nick: string | null,
  share: number,
): readonly [string, string, number] => [species, nick ?? SPECIES_NAME[species] ?? species, share];

/** The eleven players of a big server. The caller (index 3) is "Misa". */
const BIG: readonly PlayerSeed[] = [
  {
    name: 'Dee',
    weight: 19,
    support: 380,
    team: [c('stormray', null, 56), c('zipmouse', null, 28), c('sproutle', null, 16)],
  },
  {
    name: 'Bob',
    weight: 15,
    support: 520,
    team: [c('cindle', 'Biscuit', 52), c('ashmole', null, 30), c('mistnewt', null, 18)],
  },
  {
    name: 'Kaisa',
    weight: 13,
    support: 240,
    team: [c('pyrelynx', null, 60), c('splashet', null, 25), c('thornbuck', null, 15)],
  },
  {
    name: 'Misa',
    weight: 11,
    support: 910,
    team: [c('tempestray', null, 48), c('voltaro', null, 32), c('ashmole', 'Cinders', 20)],
  },
  {
    name: 'Juho',
    weight: 9,
    support: 300,
    team: [c('coralynx', null, 55), c('mossback', null, 25), c('zipmouse', null, 20)],
  },
  {
    name: 'Aino',
    weight: 8,
    support: 640,
    team: [c('tidewing', null, 40), c('sproutle', null, 35), c('cindle', null, 25)],
  },
  {
    name: 'Teemu',
    weight: 7,
    support: 150,
    team: [c('geyserpup', null, 62), c('mistnewt', null, 20), c('voltaro', null, 18)],
  },
  {
    name: 'Ville',
    weight: 6,
    support: 420,
    team: [c('bloomback', null, 50), c('splashet', null, 30), c('thornbuck', null, 20)],
  },
  {
    name: 'Noora',
    weight: 5,
    support: 780,
    team: [c('mossback', null, 38), c('ashmole', null, 34), c('sproutle', null, 28)],
  },
  {
    name: 'Pekka',
    weight: 4,
    support: 90,
    team: [c('zipmouse', null, 60), c('cindle', null, 22), c('mistnewt', null, 18)],
  },
  {
    name: 'Sanna',
    weight: 3,
    support: 200,
    team: [c('splashet', null, 45), c('tidewing', null, 30), c('thornbuck', null, 25)],
  },
];

/** The three players of a small server. The caller is "Misa" again. */
const SMALL: readonly PlayerSeed[] = [
  {
    name: 'Dee',
    weight: 40,
    support: 300,
    team: [c('stormray', null, 55), c('zipmouse', null, 30), c('sproutle', null, 15)],
  },
  {
    name: 'Misa',
    weight: 33,
    support: 700,
    team: [c('cindle', 'Biscuit', 50), c('ashmole', null, 30), c('mistnewt', null, 20)],
  },
  {
    name: 'Bob',
    weight: 27,
    support: 260,
    team: [c('splashet', null, 52), c('thornbuck', null, 28), c('voltaro', null, 20)],
  },
];

interface StageOptions {
  seeds: readonly PlayerSeed[];
  /** The caller's name in `seeds`. */
  you: string;
  phase: AfterActionStats['phase'];
  outcome: StatsOutcome;
  close: boolean;
  retreated?: boolean;
  enraged?: boolean;
  rounds: number;
  maxRounds: number;
  hpMax: number;
  hpStart: number;
  hpEnd: number;
  needed: number;
  reactions: readonly StatsReaction[];
  abilities: readonly StatsAbilityUse[];
  unused: number;
  knockouts: readonly StatsKnockout[];
  adaptation: StatsAdaptation | null;
}

const use = (
  player: string,
  you: boolean,
  ability: string,
  creature: string | null,
  round: number,
  byDefault: boolean,
): StatsAbilityUse => ({ player, you, ability, creature, round, byDefault });

const ko = (
  creature: string,
  species: string,
  owner: string,
  you: boolean,
  round: number,
): StatsKnockout => ({
  creature,
  species,
  owner,
  you,
  round,
});

/** The stats of one stage: damage is split by weight to add up to what came off the boss. */
function stats(o: StageOptions): AfterActionStats {
  const taken = o.hpStart - o.hpEnd;
  const weightSum = o.seeds.reduce((sum, s) => sum + s.weight, 0);
  const damages = o.seeds.map((s) => Math.floor((taken * s.weight) / weightSum));
  damages[0] = (damages[0] ?? 0) + (taken - damages.reduce((sum, d) => sum + d, 0));

  const players: StatsPlayer[] = o.seeds.map((s, i) => ({
    displayName: s.name,
    you: s.name === o.you,
    damage: damages[i] ?? 0,
    contribution: (damages[i] ?? 0) + s.support,
  }));

  const all: StatsCreature[] = o.seeds.flatMap((s, i) =>
    s.team.map(([species, name, share]) => ({
      rank: 0,
      name,
      species,
      owner: s.name,
      you: s.name === o.you,
      damage: Math.floor(((damages[i] ?? 0) * share) / 100),
      contribution: Math.floor((((damages[i] ?? 0) + s.support) * share) / 100),
    })),
  );
  const ranked = all
    .sort((a, b) => b.damage - a.damage || b.contribution - a.contribution)
    .map((cr, index) => ({ ...cr, rank: index + 1 }));
  // The server lists the five best and always the caller's own.
  const listed = ranked.filter((cr, index) => index < 5 || cr.you);

  return {
    phase: o.phase,
    outcome: o.outcome,
    ...(o.retreated === true ? { retreated: true } : {}),
    ...(o.enraged === true ? { enraged: true } : {}),
    close: o.close,
    rounds: o.rounds,
    maxRounds: o.maxRounds,
    boss: {
      hpMax: o.hpMax,
      hpStart: o.hpStart,
      hpEnd: o.hpEnd,
      leftBp: Math.round((o.hpEnd * 10_000) / o.hpMax),
      needed: o.needed,
      lost: o.hpMax - o.hpEnd,
    },
    players,
    creatures: listed,
    reactions: [...o.reactions],
    reactionsTotal: o.reactions.reduce((sum, r) => sum + r.count, 0),
    abilities: { used: [...o.abilities], unused: o.unused },
    knockouts: [...o.knockouts],
    adaptation: o.adaptation,
  };
}

const FINALE_LOOT: GrantLoot = {
  gear: [{ id: 'g1', baseId: 'kelp-cap', rarity: 'rare', itemLevel: 12 }],
  converted: [],
  parts: { scrap: 4, glimmer: 1 },
  blueprints: [],
};

const FESTIVAL_LOOT: GrantLoot = {
  gear: [{ id: 'g2', baseId: 'festival-hearth-scarf', rarity: 'epic', itemLevel: 14 }],
  converted: [],
  parts: { scrap: 6 },
  blueprints: [{ baseId: 'forge-scarf', duplicate: false }],
};

export interface SummaryCase {
  /** The label of the case in the workbench ("Cleared, 11 players"). */
  label: string;
  input: SummaryInput;
}

const ABILITIES = (you: boolean): StatsAbilityUse[] => [
  use('Dee', false, 'Rally', null, 2, false),
  use('Bob', false, 'Shield Wall', null, 3, true),
  use('Misa', you, 'Tidal Mark', 'Tempestray', 3, false),
  use('Kaisa', false, 'Flare Strike', 'Pyrelynx', 4, true),
  use('Misa', you, 'Purge', null, 4, false),
  use('Juho', false, 'Coral Lance', 'Coralynx', 5, true),
  use('Dee', false, 'Thunder Strike', 'Stormray', 6, false),
  use('Aino', false, 'Soft Rain', 'Tidewing', 7, true),
  use('Noora', false, 'Full Bloom', 'Mossback', 8, true),
  use('Misa', you, 'Storm Zap', 'Voltaro', 9, false),
  use('Dee', false, 'Tempest Strike', 'Stormray', 9, false),
];

/** The sample summaries, in the order the workbench lists them. */
export const SUMMARY_CASES: readonly SummaryCase[] = [
  {
    label: 'Finale cleared, 11 players',
    input: {
      boss: { id: 'tidal-colossus', name: 'Tidal Colossus' },
      stats: stats({
        seeds: BIG,
        you: 'Misa',
        phase: 'finale',
        outcome: 'cleared',
        close: false,
        rounds: 9,
        maxRounds: 12,
        hpMax: 31_000,
        hpStart: 31_000,
        hpEnd: 0,
        needed: 31_000,
        reactions: [
          { name: 'Overload', count: 14, reflected: 0 },
          { name: 'Steam', count: 9, reflected: 0 },
          { name: 'Grounding', count: 6, reflected: 0 },
          { name: 'Wildfire', count: 4, reflected: 0 },
        ],
        abilities: ABILITIES(true),
        unused: 2,
        knockouts: [
          ko('Teemu', 'geyserpup', 'Teemu', false, 4),
          ko('Pekka', 'zipmouse', 'Pekka', false, 5),
          ko('Biscuit', 'cindle', 'Bob', false, 6),
          ko('Cinders', 'ashmole', 'Misa', true, 7),
          ko('Sanna', 'splashet', 'Sanna', false, 8),
        ],
        adaptation: {
          name: 'Reaction Resistance',
          target: 'Overload',
          resistBp: 5000,
          purged: true,
          purgedRound: 4,
          restoredRound: 7,
        },
      }),
      rewards: {
        essence: 46,
        loot: FINALE_LOOT,
        festivalGrant: null,
        rankChange: { before: 4, after: 5, festival: false, serverWon: true },
        seasonWeek: 3,
      },
    },
  },
  {
    label: 'Finale not cleared, 11 players',
    input: {
      boss: { id: 'cinder-wyrm', name: 'Cinder Wyrm' },
      stats: stats({
        // The caller had a rougher night here: 7th instead of 4th.
        seeds: BIG.map((s) => (s.name === 'Misa' ? { ...s, weight: 6.5 } : s)),
        you: 'Misa',
        phase: 'finale',
        outcome: 'missed',
        close: true,
        enraged: true,
        rounds: 14,
        maxRounds: 12,
        hpMax: 36_000,
        hpStart: 36_000,
        hpEnd: 4_300,
        needed: 36_000,
        reactions: [
          { name: 'Steam', count: 11, reflected: 3 },
          { name: 'Wildfire', count: 7, reflected: 2 },
          { name: 'Overload', count: 3, reflected: 0 },
        ],
        abilities: ABILITIES(true).slice(0, 8),
        unused: 5,
        knockouts: [
          ko('Teemu', 'geyserpup', 'Teemu', false, 3),
          ko('Pekka', 'zipmouse', 'Pekka', false, 3),
          ko('Cinders', 'ashmole', 'Misa', true, 4),
          ko('Biscuit', 'cindle', 'Bob', false, 5),
          ko('Sanna', 'splashet', 'Sanna', false, 6),
          ko('Aino', 'tidewing', 'Aino', false, 8),
          ko('Voltaro', 'voltaro', 'Misa', true, 10),
          ko('Mossback', 'mossback', 'Noora', false, 12),
        ],
        adaptation: {
          name: 'Element Resistance',
          target: 'Ember',
          resistBp: 2500,
          purged: false,
          purgedRound: null,
          restoredRound: null,
        },
      }),
      rewards: {
        essence: 14,
        loot: null,
        festivalGrant: null,
        rankChange: { before: 4, after: 4, festival: false, serverWon: false },
        seasonWeek: 2,
      },
    },
  },
  {
    label: 'Finale cleared, 3 players (Festival)',
    input: {
      boss: { id: 'thornmother', name: 'Thornmother' },
      stats: stats({
        seeds: SMALL,
        you: 'Misa',
        phase: 'finale',
        outcome: 'cleared',
        close: true,
        rounds: 12,
        maxRounds: 12,
        hpMax: 7_200,
        hpStart: 7_200,
        hpEnd: 0,
        needed: 7_200,
        reactions: [
          { name: 'Wildfire', count: 6, reflected: 0 },
          { name: 'Overload', count: 2, reflected: 0 },
        ],
        abilities: [
          use('Dee', false, 'Rally', null, 2, false),
          use('Misa', true, 'Shield Wall', null, 3, true),
          use('Bob', false, 'Geyser Burst', 'Splashet', 6, true),
          use('Misa', true, 'Flare Strike', 'Cindle', 11, false),
          use('Misa', true, 'Inferno Strike', 'Cindle', 12, false),
        ],
        unused: 0,
        knockouts: [ko('Mistnewt', 'mistnewt', 'Misa', true, 8)],
        adaptation: null,
      }),
      rewards: {
        essence: 52,
        loot: FESTIVAL_LOOT,
        festivalGrant: { species: 'lanternfin', outcome: 'new', firstOnServer: true },
        rankChange: { before: 7, after: 6, festival: true, serverWon: true },
        seasonWeek: 5,
      },
    },
  },
  {
    label: 'Finale wiped, 3 players',
    input: {
      boss: { id: 'storm-sovereign', name: 'Storm Sovereign' },
      stats: stats({
        seeds: [
          SMALL[0] as PlayerSeed,
          SMALL[2] as PlayerSeed,
          { ...(SMALL[1] as PlayerSeed), weight: 14 },
        ],
        you: 'Misa',
        phase: 'finale',
        outcome: 'wiped',
        close: false,
        rounds: 7,
        maxRounds: 12,
        hpMax: 7_800,
        hpStart: 7_800,
        hpEnd: 5_100,
        needed: 7_800,
        reactions: [{ name: 'Overload', count: 3, reflected: 0 }],
        abilities: [
          use('Dee', false, 'Rally', null, 2, true),
          use('Misa', true, 'Purge', null, 4, false),
        ],
        unused: 3,
        knockouts: [
          ko('Zipmouse', 'zipmouse', 'Dee', false, 4),
          ko('Sproutle', 'sproutle', 'Dee', false, 4),
          ko('Splashet', 'splashet', 'Bob', false, 5),
          ko('Mistnewt', 'mistnewt', 'Misa', true, 5),
          ko('Thornbuck', 'thornbuck', 'Bob', false, 6),
          ko('Voltaro', 'voltaro', 'Bob', false, 6),
          ko('Ashmole', 'ashmole', 'Misa', true, 6),
          ko('Stormray', 'stormray', 'Dee', false, 7),
          ko('Biscuit', 'cindle', 'Misa', true, 7),
        ],
        adaptation: {
          name: 'Element Resistance',
          target: 'Spark',
          resistBp: 2500,
          purged: true,
          purgedRound: 4,
          restoredRound: null,
        },
      }),
      rewards: {
        essence: 9,
        loot: null,
        festivalGrant: null,
        rankChange: null,
        seasonWeek: 1,
      },
    },
  },
  {
    label: 'Phase 2 cleared, 6 players',
    input: {
      boss: { id: 'tidal-colossus', name: 'Tidal Colossus' },
      stats: stats({
        seeds: [BIG[1], BIG[3], BIG[0], BIG[4], BIG[5], BIG[8]] as PlayerSeed[],
        you: 'Misa',
        phase: 'phase2',
        outcome: 'cleared',
        close: false,
        retreated: true,
        rounds: 8,
        maxRounds: 10,
        hpMax: 14_000,
        hpStart: 9_000,
        hpEnd: 6_200,
        needed: 7_000,
        reactions: [
          { name: 'Steam', count: 5, reflected: 0 },
          { name: 'Grounding', count: 2, reflected: 0 },
        ],
        abilities: [],
        unused: 0,
        knockouts: [],
        adaptation: null,
      }),
      rewards: { essence: 6, loot: null, festivalGrant: null, rankChange: null, seasonWeek: 3 },
    },
  },
];

/** The sample by its label. */
export function summaryCase(label: string): SummaryCase {
  return SUMMARY_CASES.find((s) => s.label === label) ?? (SUMMARY_CASES[0] as SummaryCase);
}
