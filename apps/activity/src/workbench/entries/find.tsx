import { gearContent, talentDef, talentText } from '@creatures/game';
import { GearItemsContext } from '../../gear-items-context';
import { sampleGearItem } from '../gear-sample';
import { essenceCount, partCountItems } from '../../count-items';
import type { GearRarity } from '../../gear-types';
import type { TalentView } from '../../talent-types';
import { CountBadgeList } from '../../ui/CountBadge';
import { FindBlueprint } from '../../ui/FindBlueprint';
import { FindCreature, type FoundCreature } from '../../ui/FindCreature';
import { FindItem, FindItems } from '../../ui/FindItem';
import { FindList } from '../../ui/FindRow';
import { bool, num, str } from '../props';
import type { Entry } from '../types';

/** The base ids by what a tag shows: an element, a role, none, a set piece. Read from the content as it is. */
const BASES = gearContent.bases;
const pick = (test: (b: (typeof BASES)[number]) => boolean, fallback: string): string =>
  BASES.find(test)?.id ?? fallback;
const WITH_ELEMENT = pick((b) => b.tag === 'ember' && b.set === undefined, 'forge-hood');
const WITH_ROLE = pick((b) => b.tag === 'guard' && b.set === undefined, 'wardens-bell');
const NEUTRAL = pick((b) => b.tag === 'neutral', 'trail-cap');
const SET_PIECE = pick((b) => b.set !== undefined && b.tag !== 'neutral', 'tidepool-cowl');
const FESTIVAL = pick((b) => b.id.startsWith('festival-'), 'festival-hearth-scarf');

const BASE_CHOICES: Readonly<Record<string, string>> = {
  'An element (Ember)': WITH_ELEMENT,
  'A role (Guard)': WITH_ROLE,
  'No tag (neutral)': NEUTRAL,
  'A set piece': SET_PIECE,
  'A Festival piece': FESTIVAL,
};
const BASE_NAMES = Object.keys(BASE_CHOICES);
const RARITIES: readonly GearRarity[] = ['common', 'rare', 'epic'];

const baseOf = (p: Parameters<Entry['render']>[0]): string =>
  BASE_CHOICES[str(p, 'item')] ?? NEUTRAL;

const findItem: Entry = {
  name: 'FindItem',
  file: 'apps/activity/src/ui/FindItem.tsx',
  group: 'Loot & reveals',
  description:
    'A gear piece that was found or gained, as one box (a tap opens its full item card in a popover, and so does hovering with a mouse; a piece with no inventory id stays plain): its picture with the rarity border and the item level in the corner, its name in the rarity colour and a rarity badge (and Festival for a Festival piece). The one row of a found item on every screen that pays gear (the trip result, the dungeon results and chests, the raid summary, the Workshop), and what a creature wears. Several pieces sit side by side, centred, and wrap.',
  covers: ['FindItems'],
  controls: {
    item: { kind: 'select', options: BASE_NAMES },
    rarity: { kind: 'select', options: [...RARITIES] },
    level: { kind: 'number', min: 1, max: 20 },
    pieces: { kind: 'number', min: 1, max: 6 },
  },
  defaults: { item: BASE_NAMES[2] ?? '', rarity: 'common', level: 4, pieces: 1 },
  presets: [
    ...RARITIES.map((r) => ({
      name: `${r[0]?.toUpperCase() ?? ''}${r.slice(1)}`,
      props: { rarity: r },
    })),
    { name: 'A Festival piece', props: { item: 'A Festival piece', rarity: 'rare', level: 7 } },
    { name: 'Five pieces wrapping', props: { pieces: 5 } },
  ],
  render: (p) => {
    const pieces = Array.from({ length: num(p, 'pieces') }, (_, i) => ({
      id: `wb-${String(i)}`,
      baseId: i === 0 ? baseOf(p) : (BASES[(i * 7) % BASES.length]?.id ?? NEUTRAL),
      rarity: i === 0 ? (str(p, 'rarity') as GearRarity) : (RARITIES[i % 3] ?? 'common'),
      itemLevel: num(p, 'level') + i,
    }));
    return (
      <GearItemsContext.Provider value={pieces.map(sampleGearItem)}>
        <FindItems label="Found items" pieces={pieces} />
      </GearItemsContext.Provider>
    );
  },
};

const findBlueprint: Entry = {
  name: 'FindBlueprint',
  file: 'apps/activity/src/ui/FindBlueprint.tsx',
  group: 'Loot & reveals',
  description:
    'A blueprint that was found, as the same box a gear piece has: the item\'s own picture in a plain dashed frame (it is not made yet, so no rarity), the name "Blueprint: Kelp Cap", and tags: Blueprint (tap for what a blueprint is), New or Known, and the tags the crafted item will have (slot, element or role, set). Never a rarity: that is rolled when it is crafted. A repeat find says the quality it added, or that it became scrap.',
  controls: {
    item: { kind: 'select', options: BASE_NAMES },
    duplicate: { kind: 'toggle' },
    marks: { kind: 'number', min: 0, max: 10 },
  },
  defaults: { item: BASE_NAMES[0] ?? '', duplicate: false, marks: 0 },
  presets: [
    { name: 'New, with an element', props: {} },
    { name: 'New, without an element', props: { item: 'No tag (neutral)' } },
    { name: 'New, a role', props: { item: 'A role (Guard)' } },
    { name: 'New, a set piece', props: { item: 'A set piece' } },
    { name: 'Known, a mark of quality added', props: { duplicate: true, marks: 3 } },
    { name: 'Known, it became scrap', props: { duplicate: true, marks: 0 } },
  ],
  render: (p) => (
    <FindList label="Found blueprint">
      <FindBlueprint
        baseId={baseOf(p)}
        duplicate={bool(p, 'duplicate')}
        {...(bool(p, 'duplicate') && num(p, 'marks') > 0 ? { marks: num(p, 'marks') } : {})}
      />
    </FindList>
  ),
};

const talentView = (golden: boolean): TalentView => {
  const def = talentDef('playful');
  if (def === undefined) throw new Error('the workbench needs the playful talent');
  const text = talentText(def, golden);
  return { id: def.id, name: def.name, golden, text: text.text, about: text.about, idle: false };
};

const findCreature: Entry = {
  name: 'FindCreature',
  file: 'apps/activity/src/ui/FindCreature.tsx',
  group: 'Loot & reveals',
  description:
    "A creature that was found or won, as a card: its picture, its name in its rarity colour, its element and role, its badges (New!, Duplicate, Shiny!, First on server!), and the talent it rolled under a Discovered talent heading (a green New when it is new to its line). The one card of a creature find: a trip's catches and waiting duplicates (FindCard adds the choice as radio rows) and the Festival creature of a finale.",
  controls: {
    species: { kind: 'select', options: ['splashet', 'cindle', 'hearthshell', 'lanternfin'] },
    outcome: { kind: 'select', options: ['New!', 'Duplicate'] },
    shiny: { kind: 'toggle' },
    first: { kind: 'toggle' },
    talent: { kind: 'toggle' },
  },
  defaults: { species: 'splashet', outcome: 'New!', shiny: false, first: false, talent: true },
  presets: [
    { name: 'New', props: {} },
    { name: 'A duplicate', props: { outcome: 'Duplicate' } },
    { name: 'Shiny and first on the server', props: { shiny: true, first: true } },
    { name: 'No talent (a catch from before talents)', props: { talent: false } },
    { name: 'A Festival creature', props: { species: 'lanternfin', first: true } },
  ],
  render: (p) => {
    const creature: FoundCreature = {
      species: str(p, 'species'),
      shiny: bool(p, 'shiny'),
      talent: bool(p, 'talent') ? talentView(false) : null,
      talentNew: str(p, 'outcome') === 'New!',
      badges: [
        str(p, 'outcome') === 'New!'
          ? { text: 'New!', entry: null }
          : { text: 'Duplicate', entry: 'duplicate-choice' },
        ...(bool(p, 'first') ? [{ text: 'First on server!', entry: 'first-on-server' }] : []),
      ],
    };
    return (
      <FindList label="Found creature">
        <FindCreature creature={creature} />
      </FindList>
    );
  },
};

const findRow: Entry = {
  name: 'FindRow',
  file: 'apps/activity/src/ui/FindRow.tsx',
  group: 'Loot & reveals',
  description:
    'The pattern every find follows: resources are count badges (no ? mark), and anything with a picture is a box in a FindList: gear (FindItem), a blueprint (FindBlueprint) or a creature (FindCreature). FindRow is the one box those are built on (a picture, a name and a line of tags). This page lays out a mixed reward the way the raid summary, the trip result and the dungeon results do.',
  covers: ['FindList'],
  controls: {
    resources: { kind: 'toggle' },
    gear: { kind: 'number', min: 0, max: 4 },
    blueprint: { kind: 'toggle' },
    creature: { kind: 'toggle' },
  },
  defaults: { resources: true, gear: 2, blueprint: true, creature: true },
  presets: [
    { name: 'A mixed reward', props: {} },
    { name: 'Resources only', props: { gear: 0, blueprint: false, creature: false } },
    { name: 'Gear and a blueprint', props: { creature: false } },
    { name: 'A creature alone', props: { resources: false, gear: 0, blueprint: false } },
  ],
  render: (p) => {
    const gear = Array.from({ length: num(p, 'gear') }, (_, i) => ({
      id: `wb-${String(i)}`,
      baseId: [WITH_ELEMENT, NEUTRAL, SET_PIECE, FESTIVAL][i] ?? NEUTRAL,
      rarity: RARITIES[i % 3] ?? 'common',
      itemLevel: 4 + i,
    }));
    const any = gear.length > 0 || bool(p, 'blueprint') || bool(p, 'creature');
    return (
      <GearItemsContext.Provider value={gear.map(sampleGearItem)}>
        <div class="reveal-card pix-panel">
          {bool(p, 'resources') && (
            <CountBadgeList
              items={[
                essenceCount(14, { entry: true }),
                ...partCountItems({ scrap: 3, glimmer: 1 }),
              ]}
              label="Resources"
              class="reward-badges"
            />
          )}
          {any && (
            <FindList label="Gear, blueprints and creatures">
              {gear.map((g) => (
                <FindItem
                  key={g.id}
                  id={g.id}
                  baseId={g.baseId}
                  rarity={g.rarity}
                  level={g.itemLevel}
                  motion
                />
              ))}
              {bool(p, 'blueprint') && <FindBlueprint baseId={WITH_ELEMENT} />}
              {bool(p, 'creature') && (
                <FindCreature
                  creature={{
                    species: 'lanternfin',
                    shiny: false,
                    talent: talentView(false),
                    talentNew: true,
                    badges: [{ text: 'New!', entry: null }],
                  }}
                />
              )}
            </FindList>
          )}
        </div>
      </GearItemsContext.Provider>
    );
  },
};

export const findEntries: readonly Entry[] = [findItem, findBlueprint, findCreature, findRow];
