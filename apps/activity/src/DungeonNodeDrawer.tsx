import { GLOSSARY_IDS, QUIET_ROOM, RULES } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { bossArt, elementClass } from './art';
import {
  CRACK_LINE,
  DESCEND_LINE,
  FIERCER_LINE,
  LOCKED_LINE,
  NOT_VISITED_LINE,
  NO_TRICK_LINE,
  QUIET_LINE,
  UNREACHABLE_LINE,
  canGo,
  foeDisplayName,
  hpLine,
  isKeeper,
  nodeGlossaryEntry,
  nodeLabel,
  nodeLevel,
  nodeLines,
  nodeStatus,
  nodeTitle,
  type MapRun,
  type NodeStatus,
} from './dungeon-map';
import {
  CHEST_GEAR_LABEL,
  LOOT_LABEL,
  NO_LOOT_LINE,
  PENDING_CAMP_LINE,
  PENDING_EVENT_LINE,
  SUPPLY_LINE,
  chestLine,
  descendLine,
  doorLine,
  fightResultWord,
  foeHpOutcomeLine,
  lootOf,
  pickedLine,
  roundsLine,
  stepsAt,
} from './dungeon-history';
import { packBadges } from './dungeon-run';
import { LootList } from './GearLoot';
import { modifierIcon } from './dungeon-rooms';
import { roomTrick } from './dungeon-playback';
import type {
  DungeonKeepsakeView,
  DungeonMapNode,
  DungeonPack,
  DungeonStepLog,
} from './dungeon-types';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { gimmickGlyphKey, gimmickShort } from './raid-text';
import { Sprite } from './sprites/Sprite';
import { ElementChip } from './sprites/ElementChip';
import { CountBadge } from './ui/CountBadge';
import { Drawer } from './ui/Drawer';
import { Tag } from './ui/Tag';

interface Props {
  /** The room that was tapped, or null while the drawer is shut. */
  node: DungeonMapNode | null;
  state: MapRun | null;
  /** The rooms the run can still get to (`reachableAhead`): without it none is told to be out of reach. */
  ahead?: ReadonlySet<string> | null | undefined;
  /** Go was chosen on a room the run can reach. Without it there is no Go button (the preview). */
  onGo?: ((nodeId: string) => void) | undefined;
  /** An act is on its way: Go waits. */
  busy?: boolean | undefined;
  /** The depth is a landmark (the boss names its signature move). The run's own flag wins. */
  landmark?: boolean | undefined;
  /** The room is an Undercroft keeper on a cracked floor (the level's own flag, which the room does not carry). */
  crack?: boolean | undefined;
  /** Beating this room opens the way down into the Undercroft (the room boss at a depth that opens it). */
  descent?: boolean | undefined;
  onClose: () => void;
  /** The map button that was tapped, so the focus goes back to it. */
  returnFocusTo?: HTMLElement | null | undefined;
}

/**
 * The sheet a tap on a room opens: what is there. A fight, an elite or the room boss shows the foe's
 * picture, name, element, trick, the room's twist and HP; a mystery room, a cache and the camp say what
 * they are in a line or two. When the run can go to the room the footer has a primary Go button, which
 * closes the sheet and calls `onGo`; a room off the path says so, and one the run can never get to any more
 * says that; the preview has no footer. A room the run has been through (and the one it stands in) also
 * says what happened there, from the run's history: the fight's result, HP and loot, the cache's loot,
 * the mystery room's pick and outcome, the camp's choice; a choice still waiting says so.
 */
export function DungeonNodeDrawer({
  node,
  state,
  ahead = null,
  onGo,
  busy = false,
  landmark,
  crack = false,
  descent = false,
  onClose,
  returnFocusTo,
}: Props) {
  if (node === null) return null;
  const status = nodeStatus(node, state, ahead);
  const go = onGo !== undefined && canGo(node, state);
  const entries =
    status === 'visited' || status === 'current' ? stepsAt(state?.history, node.id) : [];
  const entry = entries[0];
  const visited = status === 'visited' || status === 'current';
  const why = whyNot(status, state);
  const footer = go ? (
    <button
      type="button"
      class="primary dnd-go"
      disabled={busy}
      aria-label={`Go to ${nodeLabel(node)}`}
      onClick={() => {
        onClose();
        onGo(node.id);
      }}
    >
      Go
    </button>
  ) : why !== null ? (
    <p class="muted dnd-blocked">{why}</p>
  ) : undefined;
  return (
    <Drawer
      open
      onClose={onClose}
      title={nodeTitle(node)}
      class="dnd"
      footer={footer}
      returnFocusTo={returnFocusTo}
    >
      {node.foe !== undefined && node.kind !== 'mystery' ? (
        <FoeBody
          node={node}
          landmark={state?.landmark ?? landmark ?? false}
          crack={crack}
          descent={descent}
          entry={entry?.result === 'fight' ? entry : undefined}
        >
          <Outcomes entries={entries} />
        </FoeBody>
      ) : (
        <PlainBody node={node} entry={entry} visited={visited}>
          <Outcomes entries={entries} />
        </PlainBody>
      )}
    </Drawer>
  );
}

/** The line in the footer when a room cannot be gone to: off the path, out of reach for good, or not visited by a finished run. */
function whyNot(status: NodeStatus, state: MapRun | null): string | null {
  if (state === null) return null;
  if (status === 'unreachable') return UNREACHABLE_LINE;
  if (status !== 'locked') return null;
  return state.status === 'active' ? LOCKED_LINE : NOT_VISITED_LINE;
}

/** The loot a room put in the pack, as icons with numbers. */
function LootRow({ pack }: { pack: DungeonPack }) {
  return (
    <div class="dnd-loot">
      <span>{LOOT_LABEL}:</span>
      <ul class="dnd-loot-items plain-list" aria-label={LOOT_LABEL}>
        {packBadges(pack).map(({ key, ...badge }) => (
          <li key={key}>
            <CountBadge {...badge} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A keepsake the room gave: its name as a chip (tap for what keepsakes are) and what it does. */
function KeepsakeLine({ keepsake }: { keepsake: DungeonKeepsakeView }) {
  return (
    <p class="dnd-keepsake">
      <Tag kind="chip" entry="keepsake" icon={{ kind: 'glyph', id: 'sparkle' }}>
        {keepsake.name}
      </Tag>
      <span>{keepsake.description}</span>
    </p>
  );
}

/**
 * What happened in a room the run has been through: its history entries in order. A boss that fell has
 * its fight, then its chest (and what the chest paid replaces the fight's own loot line), then the descent.
 */
function Outcomes({ entries }: { entries: readonly DungeonStepLog[] }) {
  const chest = entries.some((e) => e.result === 'chest');
  return (
    <>
      {entries.map((entry, i) => (
        <Outcome key={i} entry={entry} chest={chest} />
      ))}
    </>
  );
}

/** What happened in a room the run has been through, from one history entry. */
function Outcome({ entry, chest }: { entry: DungeonStepLog; chest: boolean }) {
  if (entry.result === 'pending') {
    return (
      <p class="dnd-line dnd-pending">
        {entry.kind === 'camp'
          ? PENDING_CAMP_LINE
          : entry.kind === 'descend'
            ? descendLine(entry)
            : PENDING_EVENT_LINE}
      </p>
    );
  }
  if (entry.kind === 'descend') {
    return (
      <div class="dnd-outcome">
        <p class="dnd-line">{descendLine(entry)}</p>
      </div>
    );
  }
  if (entry.result === 'door') {
    return (
      <div class="dnd-outcome">
        <p class="dnd-line">{doorLine(entry)}</p>
      </div>
    );
  }
  if (entry.result === 'chest') {
    const chestLoot = lootOf(entry);
    return (
      <div class="dnd-outcome">
        <p class="dnd-line">{chestLine(entry)}</p>
        {chestLoot !== null && <LootRow pack={chestLoot} />}
        {entry.gear.length > 0 && (
          <div class="dnd-gear">
            <span>{CHEST_GEAR_LABEL}:</span>
            <LootList
              label={CHEST_GEAR_LABEL}
              loot={{
                gear: entry.gear.map((g, i) => ({ id: `chest-${String(i)}`, ...g })),
                converted: [],
                parts: {},
                blueprints: [],
              }}
            />
          </div>
        )}
      </div>
    );
  }
  // A fight whose boss chest follows says its loot there, so the pack is not counted twice.
  const loot = chest && entry.result === 'fight' ? null : lootOf(entry);
  return (
    <div class="dnd-outcome">
      {entry.result === 'fight' && <p class="dnd-line">{roundsLine(entry)}</p>}
      {entry.result === 'event' && (
        <>
          <p class="dnd-line">{pickedLine(entry.option)}</p>
          <p class="dnd-line">{entry.outcome}</p>
        </>
      )}
      {entry.result === 'camp' && <p class="dnd-line">{entry.detail}</p>}
      {loot !== null ? (
        <LootRow pack={loot} />
      ) : (
        !chest &&
        (entry.result === 'cache' || entry.result === 'fight') && (
          <p class="muted dnd-line">{NO_LOOT_LINE}</p>
        )
      )}
      {(entry.result === 'fight' || entry.result === 'event' || entry.result === 'camp') &&
        entry.keepsake !== undefined && <KeepsakeLine keepsake={entry.keepsake} />}
      {entry.result === 'fight' && entry.supply === true && <p class="dnd-line">{SUPPLY_LINE}</p>}
    </div>
  );
}

function PlainBody({
  node,
  entry,
  visited,
  children,
}: {
  node: DungeonMapNode;
  entry: DungeonStepLog | undefined;
  /** The run has been here (or stands here). */
  visited: boolean;
  children?: ComponentChildren;
}) {
  const help = nodeGlossaryEntry(node.kind);
  // A carved door below depth 8 is a mystery room named "Quiet room": once the run has been in it, it says so.
  const quiet = node.kind === 'mystery' && node.event?.id === QUIET_ROOM.id;
  const lines =
    quiet && visited ? [QUIET_LINE] : entry === undefined || quiet ? nodeLines(node) : [];
  return (
    <div class="dnd-plain">
      {node.kind === 'mystery' && node.event !== undefined && (
        <p class="dnd-event pix">{node.event.name}</p>
      )}
      {/* A room the run has been in says what happened there, not what it might be. */}
      {lines.map((line) => (
        <p key={line} class="dnd-line">
          {line}
        </p>
      ))}
      {children}
      {help !== null && (
        <p class="dnd-help">
          <GlossaryTag entry={help} look="help" />
        </p>
      )}
    </div>
  );
}

function FoeBody({
  node,
  landmark,
  crack,
  descent,
  entry,
  children,
}: {
  node: DungeonMapNode;
  landmark: boolean;
  /** The keeper's floor is cracked. */
  crack: boolean;
  /** Beating the room opens the way down. */
  descent: boolean;
  /** How the run's fight here ended: the HP line and a Cleared or Defeat tag follow it. */
  entry: Extract<DungeonStepLog, { result: 'fight' }> | undefined;
  children?: ComponentChildren;
}) {
  const foe = node.foe;
  if (foe === undefined) return null;
  const art = bossArt(foe.id);
  const trick = roomTrick({ kind: foe.kind, foe }, landmark);
  const modifier = node.modifier;
  const epic = node.kind === 'epic';
  const elite = (node.kind === 'elite' || foe.elite) && !epic;
  const keeper = isKeeper(node);
  const deeper = nodeLevel(node.id) > 0;
  const chest = RULES.dungeon.undercroft.chest;
  const epicLoot = RULES.dungeon.undercroft.epic.loot;
  return (
    <div class="dnd-foe">
      <div class={`dnd-top ${elementClass(foe.element)}`}>
        <div class="dnd-art" aria-hidden="true">
          <Sprite sprite={art.sprite} scale={art.scale} />
        </div>
        <div class="dnd-who">
          <p class="dnd-name pix">{foeDisplayName(node)}</p>
          <p class="dnd-tags">
            {deeper && (
              <Tag kind="badge" entry="undercroft">
                {keeper ? 'Keeper' : 'Undercroft'}
              </Tag>
            )}
            {elite && (
              <Tag tone="bad" entry="elite">
                Elite
              </Tag>
            )}
            {epic && (
              <Tag tone="bad" entry="epic-fight">
                Epic
              </Tag>
            )}
            <ElementChip element={foe.element} context="boss" />
            {entry !== undefined && (
              <Tag kind="badge" tone={entry.cleared ? 'good' : 'bad'}>
                {fightResultWord(entry)}
              </Tag>
            )}
          </p>
          <p class="dnd-hp pix">
            {entry === undefined ? hpLine(foe.hpMax) : foeHpOutcomeLine(entry)}
          </p>
        </div>
      </div>
      {deeper && <p class="dnd-line dnd-fiercer">{FIERCER_LINE}</p>}
      {elite && entry === undefined && (
        <p class="dnd-line">
          A fiercer fight. Win it to earn a{' '}
          <GlossaryTag entry="keepsake" look="text">
            keepsake
          </GlossaryTag>
          .
        </p>
      )}
      {epic && entry === undefined && (
        <p class="dnd-line">
          One fierce foe at boss strength. Win it to earn {epicLoot.essence} Essence,{' '}
          {epicLoot.scrap} scrap and a{' '}
          <GlossaryTag entry="keepsake" look="text">
            keepsake
          </GlossaryTag>
          .
        </p>
      )}
      {keeper && entry === undefined && (
        <p class="dnd-line">
          Beat the keeper to open the Undercroft chest: {chest.essence} Essence, {chest.scrap} scrap
          and a {Math.round(chest.gearBp / 100)}% chance of a gear piece.
        </p>
      )}
      {keeper && crack && <p class="dnd-line dnd-crack">{CRACK_LINE}</p>}
      {descent && !keeper && entry === undefined && (
        <p class="dnd-line dnd-descend">{DESCEND_LINE}</p>
      )}
      {children}
      <p class="dnd-trick">
        {trick === null ? (
          <span class="muted">{NO_TRICK_LINE}</span>
        ) : (
          <>
            <Sprite sprite={glyphOrUnknown(gimmickGlyphKey(trick))} scale={2} />
            <strong class="pix">{trick.name}</strong>
            <span>{gimmickShort(trick, 'row')}</span>
          </>
        )}
      </p>
      {modifier !== undefined && (
        <p class="dnd-mod">
          <Tag
            kind="chip"
            entry={GLOSSARY_IDS.modifier(modifier.id)}
            icon={modifierIcon(modifier.id)}
            label={`${modifier.name}: ${modifier.description}`}
          >
            {modifier.name}
          </Tag>
          <span>{modifier.description}</span>
        </p>
      )}
    </div>
  );
}
