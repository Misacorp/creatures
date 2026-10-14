import { useState } from 'preact/hooks';
import { content, gearBase, gearContent } from '@creatures/game';
import { AbilityChip } from '../../AbilityChip';
import { BossCard } from '../../BossCard';
import { AppHead } from '../../AppHead';
import { LivingRoom, sceneOf } from '../../LivingRoom';
import { RosterStrip } from '../../RosterStrip';
import { SmallCreature } from '../../SmallCreature';
import { WornItemLine } from '../../WornItemLine';
import type { ReadinessBand, RaidView, RosterEntry } from '../../raid-api';
import { READINESS_BANDS } from '../../raid-api';
import { turnChips } from '../../replay';
import { Sprite } from '../../sprites/Sprite';
import type { RoomPhase } from '../../sprites/room-art';
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
    season: { index: 595, week: num(p, 'seasonWeek') },
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
    'The boss of the week on the Raid tab: its art, name, Boss Rank, how ready your team looks, element, HP and icons for its turn order and tricks (tap an icon for details).',
  controls: {
    boss: { kind: 'select', options: BOSS_IDS },
    rank: { kind: 'number', min: 0, max: 30 },
    bestRank: { kind: 'number', min: 0, max: 30 },
    festival: { kind: 'toggle' },
    seasonWeek: { kind: 'number', min: 1, max: 5 },
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
    seasonWeek: 3,
    readiness: 'even',
    showHp: true,
    hpNow: 7000,
    hpMax: 10000,
  },
  presets: [
    { name: 'Normal week', props: {} },
    { name: 'Festival week', props: { festival: true, seasonWeek: 5 } },
    {
      name: 'First week (no rank)',
      props: { rank: 0, bestRank: 0, seasonWeek: 1, readiness: NONE, showHp: false },
    },
    { name: 'Strong team, boss nearly dead', props: { readiness: 'strong', hpNow: 400 } },
    { name: 'Long shot', props: { readiness: 'long_shot', hpNow: 10000 } },
    { name: 'Cinder Wyrm', props: { boss: 'cinder-wyrm' } },
  ],
  render: (p) => <BossCard view={bossView(p)} />,
};

function rosterOf(count: number, you: boolean): RosterEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    displayName: you && i === 0 ? 'You' : `Player ${String(i + 1)}`,
    you: you && i === 0,
    party: 1,
  }));
}

function RosterDemo({ p }: { p: Props }) {
  const [optOut, setOptOut] = useState(false);
  const view: RaidView = {
    ...SAMPLE_RAID,
    roster: rosterOf(num(p, 'players'), bool(p, 'inRoster')),
    you: {
      ...SAMPLE_RAID.you,
      inRoster: bool(p, 'inRoster'),
      optOut,
      canOptOut: bool(p, 'canOptOut'),
    },
  };
  return <RosterStrip view={view} busy={false} onOptOut={setOptOut} />;
}

const rosterStrip: Entry = {
  name: 'RosterStrip',
  file: 'apps/activity/src/RosterStrip.tsx',
  group: 'Creatures & game pieces',
  description:
    'Who is in this week\'s raid, as a strip of small avatar tiles with the count; tap it to open the names and the "Sit this week out" button.',
  controls: {
    players: { kind: 'number', min: 0, max: 15 },
    inRoster: { kind: 'toggle' },
    canOptOut: { kind: 'toggle' },
  },
  defaults: { players: 5, inRoster: true, canOptOut: true },
  presets: [
    { name: 'Five players', props: {} },
    { name: 'Full server (15)', props: { players: 15 } },
    { name: 'Just you', props: { players: 1 } },
    { name: 'Empty, you not in', props: { players: 0, inRoster: false } },
    { name: 'Locked (cannot opt out)', props: { canOptOut: false } },
  ],
  render: (p) => (
    <RosterDemo key={`${String(num(p, 'players'))}-${String(bool(p, 'inRoster'))}`} p={p} />
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

const wornItemLine: Entry = {
  name: 'WornItemLine',
  file: 'apps/activity/src/WornItemLine.tsx',
  group: 'Creatures & game pieces',
  description:
    "The item a creature wears: its picture in the rarity frame, its name, level, main stat bonus and enchant. It is the worn-item line of a creature card on the Creatures screen (there the picture is the button that opens the gear picker) and the line in a living room creature's popover.",
  controls: {
    item: { kind: 'select', options: GEAR_BASE_IDS },
    rarity: { kind: 'select', options: RARITIES },
    level: { kind: 'number', min: 0, max: 5 },
    bonus: { kind: 'number', min: 0, max: 2000 },
    enchanted: { kind: 'toggle' },
    hasBonus: { kind: 'toggle' },
  },
  defaults: {
    item: GEAR_BASE_IDS[0] ?? 'bark-band',
    rarity: 'rare',
    level: 0,
    bonus: 850,
    enchanted: false,
    hasBonus: true,
  },
  presets: [
    { name: 'Plain', props: {} },
    { name: 'Upgraded and enchanted', props: { level: 5, enchanted: true, rarity: 'epic' } },
    { name: 'Festival', props: { rarity: 'festival' } },
    { name: 'Bonus not known yet', props: { hasBonus: false } },
  ],
  render: (p) => {
    const baseId = str(p, 'item');
    const stat = gearBase(baseId)?.primary ?? 'atk';
    const rarity = RARITIES.find((r) => r === str(p, 'rarity')) ?? 'common';
    return (
      <WornItemLine
        worn={{
          baseId,
          rarity,
          level: num(p, 'level'),
          enchantId: bool(p, 'enchanted') ? (gearContent.enchants[0]?.id ?? null) : null,
          ...(bool(p, 'hasBonus') ? { primary: { stat, bp: num(p, 'bonus') } } : {}),
        }}
      />
    );
  },
};

const NO_REF = { current: null };
const ROOM_PHASES: readonly RoomPhase[] = ['day', 'twilight', 'night'];

const livingRoom: Entry = {
  name: 'LivingRoom',
  file: 'apps/activity/src/LivingRoom.tsx',
  group: 'Creatures & game pieces',
  description:
    'The pixel living room at the top of the app: every player who has the Activity open sits in a spot with their lounging creature (tap one for its popover), and the title row is laid over the wall. Use the width switcher: wide shows the whole room centred, a phone width scrolls it sideways (mouse drag, or swipe) and pans it slowly when left alone.',
  controls: {
    players: { kind: 'number', min: 1, max: 24 },
    oneBusy: { kind: 'toggle' },
    titleRow: { kind: 'toggle' },
    phase: { kind: 'select', options: ROOM_PHASES },
  },
  defaults: { players: 4, oneBusy: false, titleRow: true, phase: 'night' },
  presets: [
    { name: 'Alone', props: { players: 1 } },
    { name: '4 players', props: {} },
    { name: 'Full room (16)', props: { players: 16 } },
    { name: 'Overflow (20, 16 shown)', props: { players: 20 } },
    { name: 'One all-busy note', props: { oneBusy: true } },
    { name: 'Day', props: { phase: 'day' } },
    { name: 'Twilight', props: { phase: 'twilight' } },
    { name: 'No title row', props: { titleRow: false } },
  ],
  render: (p) => {
    const residents = sampleResidents(num(p, 'players'), bool(p, 'oneBusy'));
    const phase = ROOM_PHASES.find((x) => x === str(p, 'phase')) ?? 'night';
    const scene = sceneOf(phase);
    // With the title row it is drawn as the app draws it: a band as wide as the window.
    return bool(p, 'titleRow') ? (
      <AppHead
        helpRef={NO_REF}
        onHelp={() => undefined}
        balances={{ bait: 52, essence: 52 }}
        room={{ residents, selfId: ROOM_SELF_ID, instanceId: 'workbench', scene }}
      />
    ) : (
      <LivingRoom
        residents={residents}
        selfId={ROOM_SELF_ID}
        instanceId="workbench"
        scene={scene}
      />
    );
  },
};

export const creatureEntries: readonly Entry[] = [
  livingRoom,
  bossCard,
  rosterStrip,
  abilityChip,
  smallCreature,
  turnStrip,
  wornItemLine,
];
