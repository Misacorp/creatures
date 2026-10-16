import { useState } from 'preact/hooks';
import { content, gearBase } from '@creatures/game';
import { AbilityChip } from '../../AbilityChip';
import { BossCard } from '../../BossCard';
import { RaidTimeline } from '../../RaidTimeline';
import { AppHead } from '../../AppHead';
import { LivingRoom, sceneOf } from '../../LivingRoom';
import { SmallCreature } from '../../SmallCreature';
import { WornItemLines } from '../../WornItemLine';
import type { ReadinessBand, RaidView } from '../../raid-api';
import { READINESS_BANDS } from '../../raid-api';
import { turnChips } from '../../replay';
import { Sprite } from '../../sprites/Sprite';
import type { RoomPhase, RoomScene } from '../../sprites/room-art';
import type { Resident } from '../../room-data';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { TurnStrip } from '../../ui/TurnStrip';
import {
  BOSS_IDS,
  GEAR_BASE_IDS,
  NONE,
  RARITIES,
  ROOM_SELF_ID,
  SAMPLE_RAID,
  SPECIES_IDS,
  creatureInfoFor,
  sampleResidents,
  speciesLabel,
  withClaims,
  type RoomClaims,
} from '../data';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

function bandOf(value: string): ReadinessBand | null {
  return READINESS_BANDS.find((b) => b === value) ?? null;
}

/** The sample Festival week with the boss, rank, season, HP and readiness the page asks for. */
function bossView(p: Props): RaidView {
  const id = str(p, 'boss');
  const def = content.bosses.find((b) => b.id === id);
  const rank = num(p, 'rank');
  return {
    ...SAMPLE_RAID,
    boss: { ...SAMPLE_RAID.boss, id, name: def?.name ?? id, element: def?.element ?? 'spark' },
    festival: bool(p, 'festival'),
    festivalCreature: bool(p, 'festival') ? 'hearthshell' : null,
    rank: rank === 0 ? null : rank,
    effectiveRank: rank === 0 ? null : Math.max(1, bool(p, 'festival') ? rank - 3 : rank),
    bestRank: num(p, 'bestRank') === 0 ? null : num(p, 'bestRank'),
    party:
      SAMPLE_RAID.party === null
        ? null
        : {
            ...SAMPLE_RAID.party,
            bossHp: bool(p, 'showHp') ? { max: num(p, 'hpMax'), current: num(p, 'hpNow') } : null,
            readiness: bandOf(str(p, 'readiness')),
          },
  };
}

const bossCard: Entry = {
  name: 'BossCard',
  file: 'apps/activity/src/BossCard.tsx',
  group: 'Creatures & game pieces',
  description:
    "The boss of the week on the Raid tab: its art, name, Boss Rank, how ready your team looks, element, this week's HP as a bar with the numbers on it, icons for its turn order and tricks (tap an icon for details) and the Phase 2 counter-move.",
  controls: {
    boss: { kind: 'select', options: BOSS_IDS },
    rank: { kind: 'number', min: 0, max: 30 },
    bestRank: { kind: 'number', min: 0, max: 30 },
    festival: { kind: 'toggle' },
    readiness: { kind: 'select', options: [NONE, ...READINESS_BANDS] },
    showHp: { kind: 'toggle' },
    hpNow: { kind: 'number', min: 0, max: 100000 },
    hpMax: { kind: 'number', min: 1, max: 100000 },
  },
  defaults: {
    boss: 'storm-sovereign',
    rank: 6,
    bestRank: 5,
    festival: false,
    readiness: 'even',
    showHp: true,
    hpNow: 7000,
    hpMax: 10000,
  },
  presets: [
    { name: 'Normal week', props: {} },
    { name: 'Festival week', props: { festival: true } },
    {
      name: 'First week (no rank)',
      props: { rank: 0, bestRank: 0, readiness: NONE, showHp: false },
    },
    { name: 'Strong team, boss nearly dead', props: { readiness: 'strong', hpNow: 400 } },
    { name: 'Long shot', props: { readiness: 'long_shot', hpNow: 10000 } },
    {
      name: 'Big numbers (written short on the bar)',
      props: { hpNow: 42023, hpMax: 50233 },
    },
    { name: 'Cinder Wyrm', props: { boss: 'cinder-wyrm' } },
  ],
  render: (p) => <BossCard view={bossView(p)} />,
};

/** The sample week with the season week and the next event the page asks for. */
function timelineView(p: Props): RaidView {
  const week = num(p, 'seasonWeek');
  const next = str(p, 'next');
  const event = (['phase1', 'phase2', 'finale'] as const).find((e) => e === next);
  return {
    ...SAMPLE_RAID,
    season: week === 0 ? null : { index: 595, week },
    next: event === undefined ? null : { event, at: SAMPLE_RAID.schedule[event] },
  };
}

const raidTimeline: Entry = {
  name: 'RaidTimeline',
  file: 'apps/activity/src/RaidTimeline.tsx',
  group: 'Creatures & game pieces',
  description:
    'The first section of the Raid tab: the week as four steps with the one thing to do now, ticks on the phases already fought, and the five season pips with "Week 3 / 5 this season" under them (tap it for what a season is).',
  controls: {
    seasonWeek: { kind: 'number', min: 0, max: 5 },
    next: { kind: 'select', options: ['phase1', 'phase2', 'finale', NONE] },
  },
  defaults: { seasonWeek: 3, next: 'phase1' },
  presets: [
    { name: 'Week 3 of the season', props: {} },
    { name: 'First week of the season', props: { seasonWeek: 1 } },
    { name: 'Festival week (the last pip)', props: { seasonWeek: 5 } },
    { name: 'No season (an old week: no pips)', props: { seasonWeek: 0 } },
    { name: 'Phase 2 comes next', props: { next: 'phase2' } },
    { name: 'The week is over (nothing next)', props: { next: NONE } },
  ],
  render: (p) => (
    <RaidTimeline
      view={timelineView(p)}
      serverNow={SAMPLE_RAID.serverNow}
      finale="before"
      onAct={() => undefined}
      onReplay={() => undefined}
    />
  ),
};

function AbilityDemo({ p }: { p: Props }) {
  const [picked, setPicked] = useState<{ abilityId: string; chosen: boolean }>({
    abilityId: SAMPLE_RAID.you.ability?.abilityId ?? 'shield-wall',
    chosen: false,
  });
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const team = SAMPLE_RAID.you.team?.creatures ?? [];
  const abilities = SAMPLE_RAID.you.abilities.map((a) => {
    const target = a.creatureId ?? 'basic';
    return { ...a, autoFire: !off.has(target) };
  });
  return (
    <AbilityChip
      you={{ ability: picked, abilities }}
      current={picked}
      abilities={abilities}
      team={team}
      editable={bool(p, 'editable')}
      busy={bool(p, 'busy')}
      onPick={(abilityId) => {
        setPicked({ abilityId, chosen: true });
      }}
      onAutoFire={(target, on) => {
        setOff((current) => {
          const next = new Set(current);
          if (on) next.delete(target);
          else next.add(target);
          return next;
        });
      }}
    />
  );
}

const abilityChip: Entry = {
  name: 'AbilityChip',
  file: 'apps/activity/src/AbilityChip.tsx',
  group: 'Creatures & game pieces',
  description:
    'The "Abilities: Auto" chip on the Raid tab: it says in a few words what the player set up for the finale and opens the basic ability pick and the Auto fire switches.',
  controls: { editable: { kind: 'toggle' }, busy: { kind: 'toggle' } },
  defaults: { editable: true, busy: false },
  presets: [
    { name: 'Editable', props: {} },
    { name: 'Locked (finale started)', props: { editable: false } },
    { name: 'Busy', props: { busy: true } },
  ],
  render: (p) => <AbilityDemo p={p} />,
};

const smallCreature: Entry = {
  name: 'SmallCreature',
  file: 'apps/activity/src/SmallCreature.tsx',
  group: 'Creatures & game pieces',
  description:
    "A small creature picture that opens the creature popover when tapped: its name, level, role and element as tags. It is on trip banners, results and the fight stage's roll call.",
  controls: {
    species: { kind: 'select', options: SPECIES_IDS },
    name: { kind: 'text', maxLength: 20 },
    level: { kind: 'number', min: 1, max: 30 },
    scale: { kind: 'number', min: 1, max: 10 },
  },
  defaults: { species: 'cindle', name: 'Cindle', level: 8, scale: 5 },
  presets: [
    { name: 'Cindle', props: {} },
    { name: 'Nicknamed', props: { species: 'zipmouse', name: 'Sparky' } },
    { name: 'High level', props: { level: 30 } },
    { name: 'Big', props: { scale: 10 } },
  ],
  render: (p) => (
    <SmallCreature
      id="wb-creature"
      info={creatureInfoFor(
        str(p, 'species'),
        str(p, 'name') || speciesLabel(str(p, 'species')),
        num(p, 'level'),
      )}
    >
      <Sprite sprite={creatureSpriteOrFallback(str(p, 'species'))} scale={num(p, 'scale')} />
    </SmallCreature>
  ),
};

const TURN_NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta'] as const;
const PLACES = [NONE, '1', '2', '3', '4'] as const;

/** The strip for four creatures at one moment: who acts now, and who is knocked out. */
function turnStripDemo(p: Props) {
  const ids = TURN_NAMES.map((_, i) => `wb-turn-${String(i + 1)}`);
  const place = (key: string): string | undefined => {
    const n = PLACES.indexOf(str(p, key) as (typeof PLACES)[number]);
    return n > 0 ? ids[n - 1] : undefined;
  };
  const acting = place('acting');
  const out = place('out');
  const actedBefore = acting === undefined ? [] : ids.slice(0, ids.indexOf(acting));
  const chips = turnChips(
    ids,
    { actor: acting ?? null, acted: actedBefore, knockedOut: [] },
    (id) => TURN_NAMES[ids.indexOf(id)] ?? id,
    { knockedOut: (id) => id === out },
  );
  return <TurnStrip chips={chips} label="Turn order" />;
}

const turnStrip: Entry = {
  name: 'TurnStrip',
  file: 'apps/activity/src/ui/TurnStrip.tsx',
  group: 'Creatures & game pieces',
  description:
    'The strip of who acts in what order: a chip for each creature, the one acting now outlined, the ones that acted dimmed and a knocked-out one struck through. No screen shows it now (the stage writes the order under the creatures instead); it is kept for later.',
  controls: {
    acting: { kind: 'select', options: PLACES },
    out: { kind: 'select', options: PLACES },
  },
  defaults: { acting: '2', out: NONE },
  presets: [
    { name: 'Second acting', props: {} },
    { name: 'Last acting', props: { acting: '4' } },
    { name: 'One knocked out', props: { acting: '3', out: '2' } },
    { name: 'Before the first turn', props: { acting: NONE } },
  ],
  render: (p) => turnStripDemo(p),
};

const wornItemLines: Entry = {
  name: 'WornItemLines',
  file: 'apps/activity/src/WornItemLine.tsx',
  group: 'Creatures & game pieces',
  description:
    "What a creature wears in a living room creature's popover: one line per item with its picture in the rarity frame, its name, slot and item level, and the text of its lines. A creature card on the Creatures screen shows the same items as three slots instead.",
  controls: {
    item: { kind: 'select', options: GEAR_BASE_IDS },
    rarity: { kind: 'select', options: RARITIES },
    itemLevel: { kind: 'number', min: 1, max: 20 },
    hasLines: { kind: 'toggle' },
  },
  defaults: {
    item: GEAR_BASE_IDS[0] ?? 'trail-cap',
    rarity: 'rare',
    itemLevel: 8,
    hasLines: true,
  },
  presets: [
    { name: 'Plain', props: {} },
    { name: 'Epic, item level 20', props: { itemLevel: 20, rarity: 'epic' } },
    { name: 'Festival', props: { rarity: 'festival' } },
    { name: 'Lines not known yet', props: { hasLines: false } },
  ],
  render: (p) => {
    const baseId = str(p, 'item');
    const slot = gearBase(baseId)?.slot ?? 'hat';
    const rarity = RARITIES.find((r) => r === str(p, 'rarity')) ?? 'common';
    return (
      <WornItemLines
        worn={[
          {
            baseId,
            slot,
            rarity,
            itemLevel: num(p, 'itemLevel'),
            ...(bool(p, 'hasLines') ? { lines: ['Attack +4%', 'Tide Hunter +7%'] } : {}),
          },
        ]}
      />
    );
  },
};

const NO_REF = { current: null };
const ROOM_PHASES: readonly RoomPhase[] = ['day', 'twilight', 'night'];

const ROOM_CLAIMS: readonly RoomClaims[] = ['none', 'collide'];

/**
 * The living room with your own creature movable: a move is kept here, as the game keeps it in its
 * state (the claim is the moment you dropped it), and everyone else's claims are fixed.
 */
function RoomDemo({
  residents,
  movable,
  titleRow,
  scene,
}: {
  residents: readonly Resident[];
  movable: boolean;
  titleRow: boolean;
  scene: RoomScene;
}) {
  const [spot, setSpot] = useState<Resident['spot']>(
    residents.find((r) => r.userId === ROOM_SELF_ID)?.spot ?? null,
  );
  const shown = residents.map((r) => (r.userId === ROOM_SELF_ID ? { ...r, spot } : r));
  const onMove = movable
    ? (spotId: string): void => {
        setSpot({ id: spotId, at: Date.now() });
      }
    : undefined;
  // With the title row it is drawn as the app draws it: a band as wide as the window.
  return titleRow ? (
    <AppHead
      helpRef={NO_REF}
      onHelp={() => undefined}
      balances={{ bait: 52, essence: 52 }}
      room={{
        residents: shown,
        selfId: ROOM_SELF_ID,
        instanceId: 'workbench',
        scene,
        ...(onMove === undefined ? {} : { onMove }),
      }}
    />
  ) : (
    <LivingRoom
      residents={shown}
      selfId={ROOM_SELF_ID}
      instanceId="workbench"
      scene={scene}
      {...(onMove === undefined ? {} : { onMove })}
    />
  );
}

const livingRoom: Entry = {
  name: 'LivingRoom',
  file: 'apps/activity/src/LivingRoom.tsx',
  group: 'Creatures & game pieces',
  description:
    'The pixel living room at the top of the app: every player who has the Activity open sits in a spot with their lounging creature (tap one for its popover), and the title row is laid over the wall. Use the width switcher: wide shows the whole room centred, a phone width scrolls it sideways (mouse drag, or swipe) and pans it slowly when left alone. With "movable" on, drag your own creature ("You") to an empty spot (mouse: press and move; touch: hold, then move), or open its popover and use Move to pick a spot with the keyboard.',
  controls: {
    players: { kind: 'number', min: 1, max: 24 },
    oneBusy: { kind: 'toggle' },
    titleRow: { kind: 'toggle' },
    phase: { kind: 'select', options: ROOM_PHASES },
    movable: { kind: 'toggle' },
    claims: { kind: 'select', options: ROOM_CLAIMS },
  },
  defaults: {
    players: 4,
    oneBusy: false,
    titleRow: true,
    phase: 'night',
    movable: false,
    claims: 'none',
  },
  presets: [
    { name: 'Alone', props: { players: 1 } },
    { name: '4 players', props: {} },
    { name: 'Full room (16)', props: { players: 16 } },
    { name: 'Overflow (20, 16 shown)', props: { players: 20 } },
    { name: 'One all-busy note', props: { oneBusy: true } },
    { name: 'Day', props: { phase: 'day' } },
    { name: 'Twilight', props: { phase: 'twilight' } },
    { name: 'No title row', props: { titleRow: false } },
    { name: 'Drag your own creature', props: { movable: true } },
    {
      name: 'Claims collide (older wins)',
      props: { players: 6, claims: 'collide', movable: true },
    },
  ],
  render: (p) => {
    const claims = ROOM_CLAIMS.find((x) => x === str(p, 'claims')) ?? 'none';
    const residents = withClaims(sampleResidents(num(p, 'players'), bool(p, 'oneBusy')), claims);
    const phase = ROOM_PHASES.find((x) => x === str(p, 'phase')) ?? 'night';
    return (
      <RoomDemo
        // A new set of residents starts from their own claims.
        key={`${String(num(p, 'players'))}:${String(bool(p, 'oneBusy'))}:${claims}`}
        residents={residents}
        movable={bool(p, 'movable')}
        titleRow={bool(p, 'titleRow')}
        scene={sceneOf(phase)}
      />
    );
  },
};

export const creatureEntries: readonly Entry[] = [
  livingRoom,
  bossCard,
  raidTimeline,
  abilityChip,
  smallCreature,
  turnStrip,
  wornItemLines,
];
