/**
 * The shared sample world of the prototypes (`prototype.html`, dev only): one coherent Saturday morning,
 * built only from the game's own samples and captured fixtures, plus pure helpers that apply each action
 * of the tour (`tour.ts`) and return the new world. No network, no randomness: outcomes are canned.
 *
 * The prototypes read a `ProtoWorld` and call the helpers; they never change it in place. `worldAtStep(n)`
 * is the world as it stands when step `n` of the tour begins (every earlier step's action applied).
 */
import { content } from '@creatures/game';
import type { Creature } from '../api';
import { creatureName } from '../game';
import { sampleRoster } from '../creature-card-sample';
import { parseDungeonToday } from '../dungeon-parse';
import type { DungeonToday } from '../dungeon-types';
import creatureHaul from '../fixtures/expedition-claim-loot.json';
import destinationsFixture from '../fixtures/expedition-destinations.json';
import dungeonTodayFixture from '../fixtures/dungeon-today.json';
import gearFixture from '../fixtures/gear-state.json';
import raidFixture from '../fixtures/raid-autofire.json';
import { isTripResult, parseDestinations } from '../expedition-parse';
import type { DestinationsView, ExpeditionLength, Trip, TripResult } from '../expedition-types';
import { parseGearState } from '../gear-parse';
import type { GearItem, GearRarity, Job, PartKind, ReachId } from '../gear-types';
import type { GamesView } from '../games-types';
import { parseRaidView, type RaidView } from '../raid-api';
import type { Resident } from '../room-data';
import { sampleResidents } from '../workbench/data';
import { sampleGearItem } from '../workbench/gear-sample';
import { gamesView } from '../workbench/games-tab-sample';
import { HOME_NOW, HOME_TZ, RAID } from '../workbench/home-sample';

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** The fixed "now": Saturday 13 February 2027, 10:00 in Helsinki. */
export const WORLD_NOW = HOME_NOW;
export const WORLD_TZ = HOME_TZ;
/** A time of day (Helsinki, UTC+2 in February) on that Saturday. */
const at = (hour: number, minute: number): number => Date.UTC(2027, 1, 13, hour - 2, minute);

/** What the world is made of. Everything but `now`, `timezone` and `haul` is game data of the real shapes. */
export interface ProtoWorld {
  now: number;
  timezone: string;
  creatures: Creature[];
  balances: { bait: number; essence: number };
  parts: Record<PartKind, number>;
  /** Supply id to amount. */
  supplies: Record<string, number>;
  /** Explorer slots: `used` counts trips out and trips home that are not claimed yet. */
  slots: { total: number; used: number };
  /** Open trips (out or home, unclaimed), then claimed ones. */
  trips: Trip[];
  destinations: DestinationsView;
  /** Workshop jobs, the open ones first. */
  jobs: Job[];
  jobSlots: { total: number; used: number };
  /** The gear bag. */
  items: GearItem[];
  /** Base ids of the blueprints learned. */
  blueprints: string[];
  raid: RaidView;
  dungeon: DungeonToday;
  games: GamesView;
  /** The living room: you and the players who are there. */
  residents: Resident[];
  /** The last haul a claimed trip brought, for the reveal; null before any claim. */
  haul: TripResult | null;
}

/** The ids of the creatures the story is about (see `TOUR`). */
export const ROSTER_ID = (n: number): string => `sample-${String(n)}`;

/** The element of a species (a content id), for tinting; `neutral` when unknown. */
export function elementOf(species: string): string {
  return content.creatures.find((c) => c.id === species)?.element ?? 'neutral';
}

/** The canned choices of the tour: who goes where, so every prototype tells the same story. */
export const TOUR = {
  /** Home from Verdant Hollow with a haul to open (step 2). */
  claimTripId: 'proto-trip-home',
  /** Step 3: a free creature goes out, to a place, for a length, with one supply packed. */
  send: {
    creatureId: ROSTER_ID(5),
    destination: 'verdant-hollow',
    length: 'medium' as ExpeditionLength,
    supply: 'satchel-basic',
  },
  /** Step 4: the finished craft, and the next job: a free creature crafts a Kelp Cap aimed at Rare. */
  claimJobId: 'proto-job-ready',
  job: { creatureId: ROSTER_ID(11), baseId: 'kelp-cap', reach: 'rare' as ReachId },
  /** Step 5: the three creatures placed for the raid, in this order. */
  raidCreatureIds: [ROSTER_ID(7), ROSTER_ID(8), ROSTER_ID(10)] as readonly string[],
  /** Step 6: the creature ready to evolve (Cindle, to Pyrelynx). */
  evolveId: ROSTER_ID(2),
} as const;

// --- The roster ---

/** Ten creatures of the sample roster (ids `sample-0`, `-1`, `-2`, `-4`, `-5`, `-6`, `-7`, `-8`, `-10`, `-11`), with who is busy. */
function buildCreatures(): Creature[] {
  return sampleRoster(12)
    .slice(0, 12)
    .filter((c) => c.id !== 'sample-3' && c.id !== 'sample-9')
    .map((c) => {
      if (c.id === ROSTER_ID(4)) {
        return { ...c, away: true, busy: { kind: 'expedition' as const, id: TOUR.claimTripId } };
      }
      if (c.id === ROSTER_ID(1)) {
        return { ...c, away: true, busy: { kind: 'expedition' as const, id: 'proto-trip-out' } };
      }
      if (c.id === ROSTER_ID(6)) {
        return { ...c, busy: { kind: 'job' as const, id: TOUR.claimJobId } };
      }
      return c;
    });
}

// --- Trips ---

function trip(
  id: string,
  creature: string,
  destination: string,
  duration: ExpeditionLength,
  endsAt: number,
): Trip {
  const length = { short: 2, medium: 6, long: 12, day: 24 }[duration] * HOUR;
  return {
    id,
    creatureId: creature,
    duration,
    supplies: 'basic',
    kit: ['satchel-basic'],
    destination,
    twist: null,
    rolls: 3,
    cost: 0,
    treat: false,
    startedAt: endsAt - length,
    endsAt,
    readyAt: endsAt,
    status: 'active',
    claimedAt: null,
    result: null,
    offer: null,
    pushOn: null,
  };
}

/** The result of a Verdant Hollow trip: the captured claim (catches, blueprints, parts, supplies, rank gift), plus one gear piece. */
function cannedHaul(creatureId: string): TripResult {
  const raw: unknown = (creatureHaul as { result: unknown }).result;
  if (!isTripResult(raw)) throw new Error('the claim fixture is not a trip result');
  const { experience } = raw;
  return {
    ...raw,
    ...(experience === undefined ? {} : { experience: { ...experience, creatureId } }),
    loot: {
      converted: [],
      parts: raw.loot?.parts ?? {},
      blueprints: raw.loot?.blueprints ?? [],
      ...(raw.loot?.supplies === undefined ? {} : { supplies: raw.loot.supplies }),
      gear: [{ id: 'proto-haul-gear', baseId: 'thundercap', rarity: 'rare', itemLevel: 4 }],
    },
  };
}

// --- Workshop ---

function readyJob(): Job {
  return {
    id: TOUR.claimJobId,
    creatureId: ROSTER_ID(6),
    kind: 'craft',
    input: { baseId: 'kelp-cap', reach: 'none' },
    cost: { scrap: 6 },
    startedAt: WORLD_NOW - 3 * HOUR - 20 * MINUTE,
    endsAt: WORLD_NOW - 20 * MINUTE,
    status: 'ready',
    claimedAt: null,
    result: null,
  };
}

// --- The world ---

function buildGear(): { items: GearItem[]; parts: Record<PartKind, number>; blueprints: string[] } {
  const gear = parseGearState(gearFixture);
  return {
    items: gear.items,
    parts: gear.parts,
    blueprints: gear.blueprints.map((b) => b.baseId),
  };
}

function buildRaid(): RaidView {
  const raid = parseRaidView(raidFixture);
  const row = (raid.party?.row ?? []).map((slot) => ({ ...slot, creature: null }));
  const others: [number, string, string, string, number][] = [
    [3, 'Aino', 'zipmouse', 'Zipmouse', 9],
    [5, 'Bo', 'thornbuck', 'Thornbuck', 12],
    [7, 'Cass', 'tidewing', 'Tidewing', 14],
  ];
  const filled = row.map((slot) => {
    const other = others.find(([n]) => n === slot.slot);
    if (other === undefined) return slot;
    const [, ownerName, species, name, level] = other;
    return { ...slot, creature: { ownerName, species, name, level, mine: false } };
  });
  return {
    ...raid,
    status: 'phase1',
    serverNow: WORLD_NOW,
    schedule: { ...RAID.schedule },
    next: { event: 'phase2', at: RAID.schedule.phase2 },
    you: {
      ...raid.you,
      inRoster: false,
      canEdit: true,
      team: null,
      ability: null,
      abilities: [],
      reveal: null,
    },
    party:
      raid.party === null ? null : { ...raid.party, row: filled, results: [], readiness: null },
  };
}

/** The Saturday morning, before the tour starts. */
export function initialWorld(): ProtoWorld {
  const gear = buildGear();
  const creatures = buildCreatures();
  const games: GamesView = {
    ...gamesView('entries: one entered').view,
    serverNow: WORLD_NOW,
  };
  const today = parseDungeonToday(dungeonTodayFixture);
  return {
    now: WORLD_NOW,
    timezone: WORLD_TZ,
    creatures,
    balances: { bait: 100, essence: 75 },
    parts: gear.parts,
    supplies: { 'satchel-basic': 2, 'lantern-basic': 1, 'map-scrap-basic': 1 },
    slots: { total: 3, used: 2 },
    trips: [
      trip(TOUR.claimTripId, ROSTER_ID(4), 'verdant-hollow', 'medium', WORLD_NOW - 40 * MINUTE),
      trip('proto-trip-out', ROSTER_ID(1), 'ember-caves', 'long', at(15, 20)),
    ],
    destinations: parseDestinations(destinationsFixture),
    jobs: [readyJob()],
    jobSlots: { total: 2, used: 1 },
    items: gear.items,
    blueprints: gear.blueprints,
    raid: buildRaid(),
    dungeon: { ...today, serverNow: WORLD_NOW, day: '2027-02-13', resetsAt: at(13, 37) },
    games: {
      ...games,
      phase: 'entries',
      next: { ...games.next, open: true, lockAt: at(13, 37), showAt: at(14, 0) },
    },
    residents: sampleResidents(5, false),
    haul: null,
  };
}

// --- Questions the prototypes ask ---

/** A creature of the world by id; throws when it is not there (a mistake in the prototype). */
export function creatureOf(world: ProtoWorld, id: string): Creature {
  const found = world.creatures.find((c) => c.id === id);
  if (found === undefined) throw new Error(`no creature ${id}`);
  return found;
}

/** Idle: not away, not on a job, not placed in the raid. */
export function isFree(world: ProtoWorld, creature: Creature): boolean {
  return !creature.away && creature.busy === null && !raidTeamIds(world).includes(creature.id);
}

/** The creatures free for a trip, a job or the raid. */
export function freeCreatures(world: ProtoWorld): Creature[] {
  return world.creatures.filter((c) => isFree(world, c));
}

/** Ids of the creatures you placed for this week's raid, in the order placed. */
export function raidTeamIds(world: ProtoWorld): string[] {
  return world.raid.you.team?.creatures.map((c) => c.creatureId) ?? [];
}

/** The trips that are home and waiting to be claimed. */
export function tripsHome(world: ProtoWorld): Trip[] {
  return world.trips.filter((t) => t.status === 'active' && t.endsAt <= world.now);
}

/** The trips still out. */
export function tripsOut(world: ProtoWorld): Trip[] {
  return world.trips.filter((t) => t.status === 'active' && t.endsAt > world.now);
}

export function jobsReady(world: ProtoWorld): Job[] {
  return world.jobs.filter((j) => j.status === 'ready');
}

/** The creature that can evolve now, if any. */
export function evolvers(world: ProtoWorld): Creature[] {
  return world.creatures.filter((c) => c.evolution?.available === true);
}

export type Need =
  | { kind: 'trip-home'; tripId: string; creatureId: string }
  | { kind: 'job-ready'; jobId: string; creatureId: string }
  | { kind: 'raid'; placed: number; needed: number }
  | { kind: 'dungeon' }
  | { kind: 'evolve'; creatureId: string }
  | { kind: 'games' };

export const RAID_TEAM_SIZE = 3;

/** What needs the player now, in the order the tour visits it. */
export function needs(world: ProtoWorld): Need[] {
  const list: Need[] = [];
  for (const t of tripsHome(world)) {
    list.push({ kind: 'trip-home', tripId: t.id, creatureId: t.creatureId });
  }
  for (const j of jobsReady(world)) {
    list.push({ kind: 'job-ready', jobId: j.id, creatureId: j.creatureId });
  }
  const placed = raidTeamIds(world).length;
  if (placed < RAID_TEAM_SIZE) list.push({ kind: 'raid', placed, needed: RAID_TEAM_SIZE });
  if (world.dungeon.canRun) list.push({ kind: 'dungeon' });
  for (const c of evolvers(world)) list.push({ kind: 'evolve', creatureId: c.id });
  if (world.games.next.open) list.push({ kind: 'games' });
  return list;
}

// --- Actions: each returns a new world ---

function replaceCreature(
  world: ProtoWorld,
  id: string,
  change: (c: Creature) => Creature,
): Creature[] {
  creatureOf(world, id);
  return world.creatures.map((c) => (c.id === id ? change(c) : c));
}

/** Claims a trip that is home. `world.haul` holds the haul to reveal; loot, Bait and the explorer's rank are applied. */
export function claimTrip(world: ProtoWorld, tripId: string): ProtoWorld {
  const found = world.trips.find((t) => t.id === tripId);
  if (found === undefined || found.status !== 'active' || found.endsAt > world.now) {
    throw new Error(`trip ${tripId} is not home`);
  }
  const haul = cannedHaul(found.creatureId);
  const loot = haul.loot;
  const parts = { ...world.parts };
  for (const [kind, n] of Object.entries(loot?.parts ?? {})) {
    parts[kind as PartKind] = (parts[kind as PartKind] ?? 0) + n;
  }
  const supplies = { ...world.supplies };
  for (const id of loot?.supplies ?? []) supplies[id] = (supplies[id] ?? 0) + 1;
  const newItems = (loot?.gear ?? []).map((g) =>
    sampleGearItem({
      id: g.id,
      baseId: g.baseId,
      rarity: g.rarity,
      itemLevel: g.itemLevel,
    }),
  );
  const blueprints = [...world.blueprints];
  for (const b of loot?.blueprints ?? []) {
    if (!blueprints.includes(b.baseId)) blueprints.push(b.baseId);
  }
  const bait = (haul.rankGifts ?? []).reduce((sum, g) => sum + g.bait, 0);
  return {
    ...world,
    balances: { ...world.balances, bait: world.balances.bait + bait },
    parts,
    supplies,
    items: [...world.items, ...newItems.filter((i) => !world.items.some((o) => o.id === i.id))],
    blueprints,
    slots: { ...world.slots, used: world.slots.used - 1 },
    trips: world.trips.map((t) =>
      t.id === tripId ? { ...t, status: 'claimed', claimedAt: world.now, result: haul } : t,
    ),
    creatures: replaceCreature(world, found.creatureId, (c) => ({
      ...c,
      away: false,
      busy: null,
    })),
    haul,
  };
}

export interface SendTripChoice {
  creatureId: string;
  destination: string;
  length: ExpeditionLength;
  /** A supply id packed (taken from the stock), or null for none. */
  supply: string | null;
}

/** Sends a free creature on a trip. The trip's id is `proto-trip-<n>`, n counting the trips. */
export function sendTrip(world: ProtoWorld, choice: SendTripChoice): ProtoWorld {
  const creature = creatureOf(world, choice.creatureId);
  if (!isFree(world, creature)) throw new Error(`${creature.id} is busy`);
  if (world.slots.used >= world.slots.total) throw new Error('no free explorer slot');
  const place = world.destinations.destinations.find((d) => d.id === choice.destination);
  if (place === undefined || place.closed.some((c) => c !== 'rank')) {
    throw new Error(`${choice.destination} is closed`);
  }
  if (choice.supply !== null && (world.supplies[choice.supply] ?? 0) < 1) {
    throw new Error(`no ${choice.supply} in stock`);
  }
  const hours = { short: 2, medium: 6, long: 12, day: 24 }[choice.length];
  const id = `proto-trip-new-${String(world.trips.length)}`;
  const sent: Trip = {
    ...trip(id, creature.id, choice.destination, choice.length, world.now + hours * HOUR),
    startedAt: world.now,
    kit: choice.supply === null ? [] : [choice.supply],
  };
  const supplies = { ...world.supplies };
  if (choice.supply !== null) supplies[choice.supply] = (supplies[choice.supply] ?? 0) - 1;
  return {
    ...world,
    supplies,
    slots: { ...world.slots, used: world.slots.used + 1 },
    trips: [sent, ...world.trips],
    creatures: replaceCreature(world, creature.id, (c) => ({
      ...c,
      away: true,
      busy: { kind: 'expedition', id },
    })),
  };
}

/** Claims a finished Workshop job: the crafted piece joins the bag, its worker is free and gains Crafting XP. */
export function claimJob(world: ProtoWorld, jobId: string): ProtoWorld {
  const job = world.jobs.find((j) => j.id === jobId);
  if (job === undefined || job.status !== 'ready') throw new Error(`job ${jobId} is not ready`);
  const baseId = job.input.baseId ?? 'kelp-cap';
  const rarity: GearRarity = job.input.reach === 'rare' ? 'rare' : 'common';
  const gearId = `proto-crafted-${job.id}`;
  const crafted: GearItem = {
    ...sampleGearItem({ id: gearId, baseId, rarity, itemLevel: 3 }),
    source: 'craft',
    createdAt: world.now,
    madeBy: { name: creatureName(creatureOf(world, job.creatureId)), at: world.now },
    origin: { kind: 'craft' },
  };
  return {
    ...world,
    items: [...world.items, crafted],
    jobSlots: { ...world.jobSlots, used: world.jobSlots.used - 1 },
    jobs: world.jobs.map((j) =>
      j.id === jobId
        ? {
            ...j,
            status: 'claimed',
            claimedAt: world.now,
            result: {
              kind: 'craft',
              gearId,
              baseId,
              rarity,
              itemLevel: 3,
              reach: job.input.reach ?? 'none',
              upgraded: false,
              xp: 36,
              skillXp: 36,
              skillLevel: 2,
              leveledUp: false,
            },
          }
        : j,
    ),
    creatures: replaceCreature(world, job.creatureId, (c) => ({ ...c, busy: null })),
  };
}

export interface StartJobChoice {
  creatureId: string;
  baseId: string;
  reach: ReachId;
}

/** Starts a craft (three hours) with a free creature in a free Workshop slot; costs 6 scrap. */
export function startJob(world: ProtoWorld, choice: StartJobChoice): ProtoWorld {
  const creature = creatureOf(world, choice.creatureId);
  if (!isFree(world, creature)) throw new Error(`${creature.id} is busy`);
  if (world.jobSlots.used >= world.jobSlots.total) throw new Error('no free Workshop slot');
  if (!world.blueprints.includes(choice.baseId)) throw new Error(`no blueprint ${choice.baseId}`);
  if (world.parts.scrap < 6) throw new Error('not enough scrap');
  const id = `proto-job-new-${String(world.jobs.length)}`;
  const job: Job = {
    id,
    creatureId: creature.id,
    kind: 'craft',
    input: { baseId: choice.baseId, reach: choice.reach },
    cost: { scrap: 6 },
    startedAt: world.now,
    endsAt: world.now + 3 * HOUR,
    status: 'running',
    claimedAt: null,
    result: null,
  };
  return {
    ...world,
    parts: { ...world.parts, scrap: world.parts.scrap - 6 },
    jobSlots: { ...world.jobSlots, used: world.jobSlots.used + 1 },
    jobs: [job, ...world.jobs],
    creatures: replaceCreature(world, creature.id, (c) => ({
      ...c,
      busy: { kind: 'job', id },
    })),
  };
}

/**
 * Places a free creature in the raid: the first empty slot of your party's board. At the third creature the
 * party reads "likely".
 */
export function placeRaid(world: ProtoWorld, creatureId: string): ProtoWorld {
  const creature = creatureOf(world, creatureId);
  const party = world.raid.party;
  if (party === null) throw new Error('joining the raid is closed');
  if (!isFree(world, creature)) throw new Error(`${creature.id} is busy`);
  const team = world.raid.you.team?.creatures ?? [];
  if (team.length >= RAID_TEAM_SIZE) throw new Error('the team is full');
  const slot = party.row.find((s) => s.creature === null);
  if (slot === undefined) throw new Error('the board is full');
  const name = creatureName(creature);
  const row = party.row.map((s) =>
    s.slot === slot.slot
      ? {
          ...s,
          creature: {
            ownerName: 'You',
            species: creature.species,
            name,
            level: creature.level,
            mine: true,
            creatureId,
          },
        }
      : s,
  );
  const placed = [
    ...team,
    { creatureId, species: creature.species, name, level: creature.level, slot: slot.slot },
  ];
  return {
    ...world,
    raid: {
      ...world.raid,
      roster: world.raid.you.inRoster
        ? world.raid.roster
        : [...world.raid.roster, { displayName: 'You', you: true, party: party.party }],
      you: { ...world.raid.you, inRoster: true, party: party.party, team: { creatures: placed } },
      party: {
        ...party,
        row,
        readiness: placed.length >= RAID_TEAM_SIZE ? 'likely' : 'even',
      },
    },
  };
}

/** Evolves a creature that can (to the main form): species, line and level cap follow, the Essence is paid. */
export function evolve(world: ProtoWorld, creatureId: string): ProtoWorld {
  const creature = creatureOf(world, creatureId);
  const evo = creature.evolution;
  if (evo?.available !== true) throw new Error(`${creatureId} cannot evolve`);
  if (world.balances.essence < evo.essence) throw new Error('not enough Essence');
  const target = content.creatures.find((c) => c.id === evo.toSpecies);
  if (target === undefined) throw new Error(`no species ${evo.toSpecies}`);
  const { evolution: _gone, ...rest } = creature;
  void _gone;
  return {
    ...world,
    balances: { ...world.balances, essence: world.balances.essence - evo.essence },
    creatures: world.creatures.map((c) =>
      c.id === creatureId
        ? {
            ...rest,
            species: target.id,
            line: target.line,
            levelCap: target.levelCap,
            waiting: false,
          }
        : c,
    ),
  };
}

// --- The tour ---

/** The world as step `step` (1 to 7) of the tour begins: the actions of every earlier step applied. */
export function worldAtStep(step: number): ProtoWorld {
  let world = initialWorld();
  if (step > 2) world = claimTrip(world, TOUR.claimTripId);
  if (step > 3) world = sendTrip(world, TOUR.send);
  if (step > 4) {
    world = claimJob(world, TOUR.claimJobId);
    world = startJob(world, TOUR.job);
  }
  if (step > 5) {
    for (const id of TOUR.raidCreatureIds) world = placeRaid(world, id);
  }
  if (step > 6) world = evolve(world, TOUR.evolveId);
  return world;
}
