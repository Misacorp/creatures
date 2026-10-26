import { content, dismantleRange, type ItemLine } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { Creature } from '../../api';
import { CreatureCard } from '../../CreatureCard';
import { CreaturePage, type CardActions, type PageOpen } from '../../CreaturePage';
import { ItemPickerDrawer } from '../../creature-page/ItemPicker';
import { sampleCreature } from '../../creature-card-sample';
import { PageHeader } from '../../creature-page/PageHeader';
import { TalentSlots } from '../../creature-page/PageSlots';
import { GearList } from '../../GearList';
import { sampleItem, wornFromBag } from '../../creature-page/bag-sample';
import {
  PAGE_SAMPLE_ID,
  SCENE_KINDS,
  pageScene,
  sceneKindOf,
  type PageScene,
  type SceneKind,
} from '../../creature-page/sample';
import type { GearActions } from '../../gear-actions';
import { ItemFrame, ItemSprite } from '../../GearArt';
import { LootList } from '../../LootList';
import type { DismantlePreview, GearItem, GearState, GrantLoot } from '../../gear-types';
import { dismantleDurationFor, gearName, wornItemOf } from '../../gear-view';
import { InventoryGrid } from '../../InventoryGrid';
import { ItemDetail } from '../../ItemDetail';
import { Drawer } from '../../ui/Drawer';
import { bool, str } from '../props';
import type { Entry, Props } from '../types';

/**
 * The scenes of the page, each with the label that is drawn in its banner (and that the screenshots are
 * named after). `kind` is the sample creature; `show` is an excerpt of the page, the whole page, or the
 * whole page with a drawer open.
 */
interface SceneDef {
  id: string;
  label: string;
  kind: SceneKind;
  show:
    | 'header'
    | 'gear'
    | 'talents'
    | 'page'
    | 'drawer'
    | 'cards'
    | 'rarities'
    | 'item'
    | 'loot'
    | 'bag'
    | 'compare';
  /** `item`: the bag item the card shows (its slot and index in the sample bag). `compare`: the id of the item the picker starts on. */
  pick?: string;
  /** `compare`: the Compare switch starts off (default on). */
  compareOff?: boolean;
  /** `compare`: a long Epic against a long worn Epic (many lines, changed, new and lost), to show the card scroll. */
  long?: boolean;
  open?: PageOpen;
  /** `item`: what the item drawer shows open: the creature list of "Equip on" (a view of the drawer), or the dismantle wizard (on Who dismantles, or on the confirmation). */
  drawer?: 'equip' | 'dismantle' | 'dismantle-confirm';
  /** `item`: creatures of every state beside the two of the sample (a Guard, a low level, away, on a job). */
  crowd?: boolean;
  /** The gear view has not loaded yet. */
  loading?: boolean;
  bait?: number;
}

const SCENE_LIST: readonly SceneDef[] = [
  { id: 'H1', label: 'H1 · Header', kind: 'level 15', show: 'header' },
  { id: 'H2', label: 'H2 · Header, long name', kind: 'long name', show: 'header' },
  { id: 'G1', label: 'G1 · Gear list (level 2)', kind: 'level 2', show: 'gear' },
  { id: 'G2', label: 'G2 · Gear list (level 15, two filled)', kind: 'level 15', show: 'gear' },
  { id: 'G3', label: 'G3 · Gear list (level 8, two empty)', kind: 'level 8', show: 'gear' },
  {
    id: 'P-B',
    label: 'P-B · Item picker: grid and detail',
    kind: 'level 15',
    show: 'drawer',
    open: { kind: 'gear', slot: 'hat' },
  },
  {
    id: 'P-C',
    label: 'P-C · Item picker: the Charm slot (role pieces)',
    kind: 'level 15',
    show: 'drawer',
    open: { kind: 'gear', slot: 'charm' },
  },
  {
    id: 'P-L',
    label: 'P-L · Item picker while the gear loads',
    kind: 'level 15',
    show: 'drawer',
    open: { kind: 'gear', slot: 'hat' },
    loading: true,
  },
  {
    id: 'S1',
    label: 'S1 · Gear list: two pieces of a gear set (the set line)',
    kind: 'set: two pieces',
    show: 'gear',
  },
  {
    id: 'S2',
    label: 'S2 · Gear list: all three pieces of a gear set',
    kind: 'set: three pieces',
    show: 'gear',
  },
  {
    id: 'S3',
    label: 'S3 · Item picker: a set piece, two of three worn',
    kind: 'set: two pieces',
    show: 'drawer',
    open: { kind: 'gear', slot: 'hat' },
  },
  {
    id: 'K1',
    label: 'K1 · Compare: a better item (Hat, plain cap worn)',
    kind: 'compare: plain gear',
    show: 'compare',
    open: { kind: 'gear', slot: 'hat' },
    pick: 'bag-hat-01',
  },
  {
    id: 'K2',
    label: 'K2 · Compare: a worse item (Hat, epic crown worn)',
    kind: 'level 15',
    show: 'compare',
    open: { kind: 'gear', slot: 'hat' },
    pick: 'bag-hat-14',
  },
  {
    id: 'K3',
    label: 'K3 · Compare: completes a set (Charm, two of three worn)',
    kind: 'set: two pieces and a charm',
    show: 'compare',
    open: { kind: 'gear', slot: 'charm' },
    pick: 'bag-charm-14',
  },
  {
    id: 'K4',
    label: 'K4 · Compare: breaks a set (Hat, two of three worn)',
    kind: 'set: two pieces',
    show: 'compare',
    open: { kind: 'gear', slot: 'hat' },
    pick: 'bag-hat-11',
  },
  {
    id: 'K5',
    label: 'K5 · Compare: an empty slot (Charm, nothing worn: every line is new)',
    kind: 'compare: plain gear',
    show: 'compare',
    open: { kind: 'gear', slot: 'charm' },
    pick: 'bag-charm-02',
  },
  {
    id: 'K6',
    label: 'K6 · Compare off (the default: the plain card)',
    kind: 'level 15',
    show: 'compare',
    open: { kind: 'gear', slot: 'hat' },
    pick: 'bag-hat-14',
    compareOff: true,
  },
  {
    id: 'K7',
    label: 'K7 · Compare: a long Epic (the card scrolls, the actions stay)',
    kind: 'level 15',
    show: 'compare',
    open: { kind: 'gear', slot: 'hat' },
    pick: 'bag-hat-02',
    long: true,
  },
  {
    id: 'K9',
    label: 'K9 · Item picker on open: nothing selected, the grid has the whole drawer',
    kind: 'level 15',
    show: 'compare',
    open: { kind: 'gear', slot: 'hat' },
  },
  {
    id: 'K8',
    label: 'K8 · Item picker: an item this creature cannot wear (the reason, in the pixel font)',
    kind: 'level 15',
    show: 'compare',
    open: { kind: 'gear', slot: 'hat' },
    pick: 'bag-hat-16',
  },
  { id: 'T1', label: 'T1 · Talent slots', kind: 'talents: golden and locked', show: 'talents' },
  {
    id: 'T1b',
    label: 'T1b · Talent slots (filled and empty)',
    kind: 'talents: filled and empty',
    show: 'talents',
  },
  {
    id: 'T1c',
    label: 'T1c · Talent slots (three: filled, empty, locked)',
    kind: 'talents: three slots',
    show: 'talents',
  },
  {
    id: 'T1d',
    label: 'T1d · Talent slots (epic: signature and three)',
    kind: 'talents: epic',
    show: 'talents',
  },
  {
    id: 'T2',
    label: 'T2 · Talent Book for slot 2 (one is in slot 1)',
    kind: 'talents: filled and empty',
    show: 'drawer',
    open: { kind: 'talent', slot: 2 },
  },
  {
    id: 'T2b',
    label: 'T2b · Talent Book (short of Bait)',
    kind: 'talents: filled and empty',
    show: 'drawer',
    open: { kind: 'talent', slot: 2 },
    bait: 4,
  },
  { id: 'F1', label: 'F1 · Page top', kind: 'level 15', show: 'page' },
  { id: 'F2', label: 'F2 · Page, nicknamed (species tag)', kind: 'nickname', show: 'page' },
  { id: 'F7', label: 'F7 · Page, with a note (open under Rename)', kind: 'note', show: 'page' },
  {
    id: 'F3',
    label: 'F3 · Page, ribbon waiting (cost and what is missing)',
    kind: 'ribbon waiting',
    show: 'page',
  },
  { id: 'F4', label: 'F4 · Page, ribbon ready', kind: 'ribbon ready', show: 'page' },
  { id: 'F5', label: 'F5 · Page, ready to evolve', kind: 'evolve ready', show: 'page' },
  {
    id: 'F6',
    label: 'F6 · Page, evolution level, short of Essence',
    kind: 'evolve short',
    show: 'page',
  },
  { id: 'C1', label: 'C1 · Cards: rarity name colours', kind: 'level 15', show: 'cards' },
  {
    id: 'W1',
    label: 'W1 · Item detail (Workshop): an epic hat with a local bonus',
    kind: 'level 15',
    show: 'item',
    pick: 'hat:0',
  },
  {
    id: 'W2',
    label: 'W2 · Item detail: a charm (no stats)',
    kind: 'level 15',
    show: 'item',
    pick: 'charm:1',
  },
  {
    id: 'W3',
    label: 'W3 · Item detail: a gear set piece nobody wears (0 / 3)',
    kind: 'level 15',
    show: 'item',
    pick: 'hat:19',
  },
  {
    id: 'W4',
    label: 'W4 · Item drawer: the Equip on list (a Guards-only Charm, every reason)',
    kind: 'level 15',
    show: 'item',
    pick: 'charm:4',
    drawer: 'equip',
    crowd: true,
  },
  {
    id: 'W5',
    label: 'W5 · Item drawer: the Equip on list for a worn item (Take off first)',
    kind: 'level 15',
    show: 'item',
    pick: 'hat:0',
    drawer: 'equip',
    crowd: true,
  },
  {
    id: 'W6',
    label: 'W6 · Item drawer: Dismantle, step 1 (Who dismantles: able, busy greyed)',
    kind: 'level 15',
    show: 'item',
    pick: 'hat:2',
    drawer: 'dismantle',
    crowd: true,
  },
  {
    id: 'W6b',
    label:
      'W6b · Item drawer: Dismantle, step 2 (the confirmation: yields, time, Cannot be undone)',
    kind: 'level 15',
    show: 'item',
    pick: 'hat:2',
    drawer: 'dismantle-confirm',
    crowd: true,
  },
  {
    id: 'W7',
    label: 'W7 · Item drawer: Equip on row, closed (nobody wears it)',
    kind: 'level 15',
    show: 'item',
    pick: 'hat:19',
    crowd: true,
  },
  { id: 'L1', label: 'L1 · Loot list, compact rows', kind: 'level 15', show: 'loot' },
  { id: 'B1', label: 'B1 · Workshop bag', kind: 'level 15', show: 'bag' },
  {
    id: 'R1',
    label: 'R1 · Rarity colours: common, rare, epic',
    kind: 'rarities',
    show: 'rarities',
  },
];

const SCENE_IDS = SCENE_LIST.map((s) => s.id);

function sceneOf(id: string): SceneDef {
  return SCENE_LIST.find((s) => s.id === id) ?? (SCENE_LIST[0] as SceneDef);
}

/** The scene's label as a banner, at its top. */
function Banner({ label }: { label: string }) {
  return (
    <p class="v3-banner" role="note">
      {label}
    </p>
  );
}

const NO_ACTIONS: Omit<CardActions, 'onEquip' | 'onSlotTalent'> = {
  onRibbon: () => undefined,
  onEvolve: () => undefined,
  onRename: () => undefined,
  onNote: () => undefined,
  onLounge: () => undefined,
};

/** The page with local state: wearing and taking off change the bag, using a book talent fills the slot. */
function LivePage({ def, kind, bait }: { def: SceneDef; kind: SceneKind; bait: number }) {
  const [scene, setScene] = useState<PageScene>(() => pageScene(kind, { bait }));
  const actions: CardActions = {
    ...NO_ACTIONS,
    onEquip: (gearId, creatureId) => {
      setScene((current) => {
        const target = current.gear.items.find((i) => i.id === gearId);
        if (target === undefined) return current;
        const items: GearItem[] = current.gear.items.map((item) => {
          if (item.id === gearId) return { ...item, equippedOn: creatureId };
          // Wearing one takes the creature's other item of that slot off.
          return creatureId !== null && item.slot === target.slot && item.equippedOn === creatureId
            ? { ...item, equippedOn: null }
            : item;
        });
        const creature: Creature = {
          ...current.creature,
          gear: wornFromBag(items, PAGE_SAMPLE_ID),
        };
        return {
          gear: { ...current.gear, items },
          creature,
          state: { ...current.state, creatures: [creature, ...current.state.creatures.slice(1)] },
        };
      });
      return Promise.resolve(true);
    },
    onSlotTalent: (_creature, talentId, golden, slot) => {
      setScene((current) => {
        const entry = current.creature.talents.book.find(
          (b) => b.id === talentId && b.golden === golden,
        );
        if (entry === undefined) return current;
        const view = {
          id: entry.id,
          name: entry.name,
          golden: entry.golden,
          text: entry.text,
          about: entry.about,
          idle: entry.idle,
        };
        const slots = current.creature.talents.slots.map((s) =>
          s.slot === slot ? { ...s, talent: view } : s,
        );
        const book = current.creature.talents.book.map((b) => ({
          ...b,
          slot:
            slots.find((s) => s.talent?.id === b.id && s.talent.golden === b.golden)?.slot ?? null,
        }));
        const creature: Creature = {
          ...current.creature,
          talents: { ...current.creature.talents, slots, book },
        };
        return {
          gear: current.gear,
          creature,
          state: {
            ...current.state,
            creatures: [creature, ...current.state.creatures.slice(1)],
            balances: {
              ...current.state.balances,
              bait: Math.max(0, current.state.balances.bait - current.state.bookSlotBait),
            },
          },
        };
      });
    },
  };
  const page = (
    <CreaturePage
      creature={scene.creature}
      state={scene.state}
      gear={def.loading === true ? null : scene.gear}
      busy={false}
      actions={actions}
      focus={null}
      initialOpen={def.open ?? null}
      onBack={() => undefined}
      onAnswerCatch={() => undefined}
    />
  );
  // A drawer is `position: fixed`: the phone-sized frame holds it, so it stays inside the scene.
  return def.show === 'drawer' ? (
    <div class="v3-phone">{page}</div>
  ) : (
    <div class="v3-bleed">{page}</div>
  );
}

/**
 * K7: the worn Hat and the picked one are both Epics with six rolled lines and the local Attack line, with
 * different lines, so the card has changed, new and lost lines (ten or more rows) and has to scroll.
 */
function longEpics(gear: GearState): GearState {
  const lines = (rolled: readonly ItemLine[], localTier: number): ItemLine[] => [
    ...rolled,
    { id: 'attack-local-pct', tier: localTier },
  ];
  const worn = lines(
    [
      { id: 'ember-hunter', tier: 3 },
      { id: 'first-pounce', tier: 2 },
      { id: 'crit-chance', tier: 3 },
      { id: 'ember-reaction', tier: 2 },
      { id: 'attack', tier: 1 },
      { id: 'strike', tier: 2 },
    ],
    1,
  );
  const next = lines(
    [
      { id: 'first-pounce', tier: 4 },
      { id: 'crit-damage', tier: 2 },
      { id: 'tide-hunter', tier: 2 },
      { id: 'ember-reaction', tier: 4 },
      { id: 'hp', tier: 3 },
      { id: 'marked-foe', tier: 2 },
    ],
    3,
  );
  const swap = (id: string, rolled: ItemLine[], equippedOn: string | null): GearItem => ({
    ...sampleItem(id, 'emberkeepers-crown', 'epic', 15, rolled),
    equippedOn,
  });
  return {
    ...gear,
    items: gear.items.map((item) =>
      item.id === 'bag-hat-01'
        ? swap(item.id, worn, item.equippedOn)
        : item.id === 'bag-hat-02'
          ? swap(item.id, next, null)
          : item,
    ),
  };
}

/** The item picker with one item picked: the compare block above Equip says what wearing it would change. */
function CompareScene({ def }: { def: SceneDef }) {
  const scene = pageScene(def.kind);
  const { creature, state } = scene;
  const gear = def.long === true ? longEpics(scene.gear) : scene.gear;
  const slot = def.open?.kind === 'gear' ? def.open.slot : 'hat';
  return (
    <div class="v3-phone">
      <ItemPickerDrawer
        open
        onClose={() => undefined}
        slot={slot}
        creature={creature}
        creatures={state.creatures}
        items={gear.items}
        onEquip={() => undefined}
        onTakeOff={() => undefined}
        initialCompare={def.compareOff !== true}
        {...(def.pick === undefined ? {} : { initialPicked: def.pick })}
      />
    </div>
  );
}

/** An excerpt of the page: the head, and the one block the scene is about, in the page's own card. */
function Excerpt({ def, bait }: { def: SceneDef; bait: number }) {
  const { creature, state, gear } = pageScene(def.kind, { bait });
  return (
    <div class="v3-bleed">
      <section class="creature-page" aria-label="Excerpt of the creature page">
        <div class="cp-block">
          <PageHeader
            creature={creature}
            state={state}
            nameId={`page-${def.id}-name`}
            skills={gear.skills}
          />
        </div>
        {def.show === 'gear' && (
          <div class="cp-block">
            <h3 class="cp-title">Gear</h3>
            <GearList
              level={creature.level}
              worn={creature.gear.map((g) => wornItemOf(g, gear.items))}
              slotOpens={gear.slotOpens}
              onPick={() => undefined}
            />
          </div>
        )}
        {def.show === 'talents' && (
          <div class="cp-block">
            <h3 class="cp-title">Talents</h3>
            <TalentSlots creature={creature} openSlot={null} onOpen={() => undefined} />
          </div>
        )}
      </section>
    </div>
  );
}

/** One creature card for each rarity (Sproutle, Stormray, Solmane), to show the name colours. */
function RarityCards() {
  const picks = ['sproutle', 'stormray', 'solmane'].flatMap((id) => {
    const species = content.creatures.find((c) => c.id === id);
    return species === undefined ? [] : [species];
  });
  const state = pageScene('level 15').state;
  return (
    <ul class="cards creature-cards">
      {picks.map((species, index) => {
        const creature: Creature = {
          ...sampleCreature('growing'),
          id: `rarity-card-${String(index)}`,
          species: species.id,
          line: species.line,
          nickname: null,
        };
        return (
          <CreatureCard
            key={creature.id}
            creature={creature}
            state={{ ...state, creatures: [creature] }}
            gear={null}
            busy={false}
            found={false}
            actions={{
              onRibbon: () => undefined,
              onEvolve: () => undefined,
              onLounge: () => undefined,
            }}
            onAnswerCatch={() => undefined}
            onOpen={() => undefined}
          />
        );
      })}
    </ul>
  );
}

/** A common, a rare and an epic item as slots and as the frames the Workshop and the loot use. */
function Rarities({ def }: { def: SceneDef }) {
  const { creature, gear } = pageScene(def.kind);
  const worn = creature.gear;
  return (
    <div class="v3-bleed">
      <section class="creature-page" aria-label="Rarity colours">
        <div class="cp-block">
          <h3 class="cp-title">Gear list</h3>
          <GearList
            level={creature.level}
            worn={creature.gear.map((g) => wornItemOf(g, gear.items))}
            slotOpens={gear.slotOpens}
            onPick={() => undefined}
          />
        </div>
        <div class="cp-block">
          <h3 class="cp-title">Item frames</h3>
          <div class="v3-rarities">
            {worn.map((item) => (
              <ItemFrame
                key={item.id}
                rarity={item.rarity}
                baseId={item.baseId}
                level={item.itemLevel}
              >
                <ItemSprite baseId={item.baseId} scale={5} />
              </ItemFrame>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

const NO_JOB_ACTIONS: GearActions = {
  equip: () => Promise.resolve(undefined),
  equipBest: () => Promise.resolve(undefined),
  dismissNotice: () => Promise.resolve(undefined),
  startJob: () => Promise.resolve(undefined),
  previewCraft: () => new Promise(() => undefined),
  previewDismantle: () => new Promise(() => undefined),
  claimJob: () => Promise.resolve(undefined),
};

/** A species of this role (the first in the content), so the picker scenes can show a Guard. */
function speciesOfRole(role: string): string {
  return content.creatures.find((c) => c.role === role)?.id ?? 'sproutle';
}

/**
 * The creatures of the Equip on picker scenes: the page's two, a Guard who can wear a Guards-only piece, a Guard
 * of a low level, one away on a trip and one on a job, so the picker shows every reason there is.
 */
function crowdOf(creatures: readonly Creature[]): Creature[] {
  const make = (id: string, over: Partial<Creature>): Creature => ({
    ...sampleCreature('growing'),
    id,
    gear: [],
    ...over,
  });
  return [
    ...creatures,
    make('wb-guard', { nickname: 'Bulwark', species: speciesOfRole('guard'), level: 16 }),
    make('wb-low', { nickname: 'Pip', species: speciesOfRole('guard'), level: 5 }),
    make('wb-away', {
      nickname: 'Wanderer',
      level: 14,
      away: true,
      busy: { kind: 'expedition', id: 'wb-trip' },
    }),
    make('wb-job', { nickname: 'Tinker', level: 15, busy: { kind: 'job', id: 'wb-job-1' } }),
  ];
}

/** The server's answer to "what would dismantling this give", worked out by the game's own rules. */
function previewOf(item: GearItem, creatureId: string): Promise<DismantlePreview> {
  const piece = { baseId: item.baseId, rarity: item.rarity, itemLevel: item.itemLevel };
  return Promise.resolve({
    kind: 'dismantle',
    creatureId,
    items: [{ id: item.id, ...piece }],
    range: dismantleRange([piece]),
    durationMs: dismantleDurationFor(item.rarity, 1),
    xp: 12,
    learnBp: 700,
    teachers: 1,
  });
}

/** The Workshop's item card for one item of the sample bag ("hat:0" is the first hat of the table). */
function ItemScene({ def }: { def: SceneDef }) {
  const scene = pageScene(def.kind);
  const { gear } = scene;
  const creatures = def.crowd === true ? crowdOf(scene.state.creatures) : scene.state.creatures;
  const [slot, index] = (def.pick ?? 'hat:0').split(':');
  const item = gear.items.filter((i) => i.slot === slot)[Number(index)];
  if (item === undefined) return null;
  const actions: GearActions = {
    ...NO_JOB_ACTIONS,
    previewDismantle: (creatureId) => previewOf(item, creatureId),
  };
  const detail = (
    <ItemDetail
      item={item}
      gear={gear}
      creatures={creatures}
      busy={false}
      actions={actions}
      onGone={() => undefined}
      initialDismantle={def.drawer === 'dismantle-confirm' ? 'confirm' : def.drawer === 'dismantle'}
      initialPicking={def.drawer === 'equip'}
    />
  );
  // The scenes with a crowd show the content in a real drawer (its widths and padding are part of the look).
  return def.crowd === true ? (
    <div class="v3-phone">
      <Drawer
        open
        title={gearName(item.baseId)}
        titleHidden
        class="item-drawer"
        onClose={() => undefined}
      >
        {detail}
      </Drawer>
    </div>
  ) : (
    <div>
      <div class="workshop">{detail}</div>
    </div>
  );
}

/** A loot list of five items of mixed rarity (as the expedition claim, the dungeon results and the finale show it). */
function LootScene() {
  const loot: GrantLoot = {
    gear: [
      { id: 'a', baseId: 'emberkeepers-crown', rarity: 'epic', itemLevel: 15 },
      { id: 'b', baseId: 'forge-scarf', rarity: 'rare', itemLevel: 14 },
      { id: 'c', baseId: 'trail-charm', rarity: 'common', itemLevel: 8 },
      { id: 'd', baseId: 'festival-hearth-scarf', rarity: 'rare', itemLevel: 13 },
      { id: 'e', baseId: 'kelp-cap', rarity: 'common', itemLevel: 2 },
    ],
    converted: [],
    parts: {},
    blueprints: [],
  };
  return (
    <div>
      <section class="card-item">
        <LootList loot={loot} label="Loot" />
      </section>
    </div>
  );
}

/** The Workshop's bag grid. */
function BagScene({ def }: { def: SceneDef }) {
  const { gear, state } = pageScene(def.kind);
  return (
    <div>
      <div class="workshop">
        <InventoryGrid
          items={gear.items.slice(0, 18)}
          creatures={state.creatures}
          selectedId={gear.items[0]?.id ?? null}
          onSelect={() => undefined}
        />
      </div>
    </div>
  );
}

function Scene({ p }: { p: Props }) {
  const def = sceneOf(str(p, 'scene'));
  const banner = bool(p, 'banner');
  const kind = sceneKindOf(str(p, 'creature') === 'scene' ? def.kind : str(p, 'creature'));
  const bait = def.bait ?? 100;
  return (
    <div class="v3-scenes">
      {banner && <Banner label={def.label} />}
      {def.show === 'header' || def.show === 'gear' || def.show === 'talents' ? (
        <Excerpt def={{ ...def, kind }} bait={bait} />
      ) : def.show === 'cards' ? (
        <RarityCards />
      ) : def.show === 'item' ? (
        <ItemScene def={{ ...def, kind }} />
      ) : def.show === 'loot' ? (
        <LootScene />
      ) : def.show === 'bag' ? (
        <BagScene def={{ ...def, kind }} />
      ) : def.show === 'compare' ? (
        <CompareScene key={`${def.id}-${kind}`} def={{ ...def, kind }} />
      ) : def.show === 'rarities' ? (
        <Rarities def={{ ...def, kind }} />
      ) : (
        <LivePage key={`${def.id}-${kind}`} def={def} kind={kind} bait={bait} />
      )}
    </div>
  );
}

const creaturePage: Entry = {
  name: 'CreaturePage',
  file: 'apps/activity/src/CreaturePage.tsx',
  group: 'Creatures & game pieces',
  description:
    "A creature's page, opened from its card in the list's place: back at the top left and Lounge at the top right, one head row (portrait, the name in its rarity colour, element, level, the experience bar), tags (the species name of a nicknamed creature, element and role), the ribbon, evolve and waiting-catch buttons when ready, stats (HP, Attack, Speed and the creature’s own expedition count), the finale ability, gear and talents as slots (a tap opens a bottom drawer: the item picker grid with its detail panel, or the Talent Book), About, Rename and the private Note. Pick a scene: H = header, G = gear slots, P = item picker, T = talent slots and Talent Book, F = the full page, C = cards, R = rarity colours, W = the Workshop's item detail, L = a compact loot list, B = the Workshop bag, K = the picker's compare (inline changes on the card, the Compare switch, what the swap does to the creature). The scenes are live: equip, take off and use a talent.",
  controls: {
    scene: { kind: 'select', options: SCENE_IDS },
    banner: { kind: 'toggle' },
    creature: { kind: 'select', options: ['scene', ...SCENE_KINDS] },
  },
  defaults: { scene: 'F1', banner: true, creature: 'scene' },
  presets: SCENE_LIST.map((s) => ({ name: s.label, props: { scene: s.id } })),
  render: (p) => <Scene p={p} />,
};

export const creaturePageEntries: readonly Entry[] = [creaturePage];
