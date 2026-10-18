import { GLOSSARY_IDS } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { bossArt, elementClass } from './art';
import {
  LOCKED_LINE,
  NOT_VISITED_LINE,
  NO_TRICK_LINE,
  UNREACHABLE_LINE,
  canGo,
  foeDisplayName,
  hpLine,
  nodeGlossaryEntry,
  nodeLabel,
  nodeLines,
  nodeStatus,
  nodeTitle,
  type MapRun,
  type NodeStatus,
} from './dungeon-map';
import {
  LOOT_LABEL,
  NO_LOOT_LINE,
  PENDING_CAMP_LINE,
  PENDING_EVENT_LINE,
  SUPPLY_LINE,
  fightResultWord,
  foeHpOutcomeLine,
  lootOf,
  pickedLine,
  roundsLine,
  stepAt,
} from './dungeon-history';
import { packBadges } from './dungeon-run';
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
  onClose,
  returnFocusTo,
}: Props) {
  if (node === null) return null;
  const status = nodeStatus(node, state, ahead);
  const go = onGo !== undefined && canGo(node, state);
  const entry =
    status === 'visited' || status === 'current' ? stepAt(state?.history, node.id) : undefined;
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
          entry={entry?.result === 'fight' ? entry : undefined}
        >
          {entry !== undefined && <Outcome entry={entry} />}
        </FoeBody>
      ) : (
        <PlainBody node={node} entry={entry}>
          {entry !== undefined && <Outcome entry={entry} />}
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

/** What happened in a room the run has been through, from its history entry. */
function Outcome({ entry }: { entry: DungeonStepLog }) {
  if (entry.result === 'pending') {
    return (
      <p class="dnd-line dnd-pending">
        {entry.kind === 'camp' ? PENDING_CAMP_LINE : PENDING_EVENT_LINE}
      </p>
    );
  }
  const loot = lootOf(entry);
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
        (entry.result === 'cache' || entry.result === 'fight') && (
          <p class="muted dnd-line">{NO_LOOT_LINE}</p>
        )
      )}
      {entry.result !== 'cache' && entry.keepsake !== undefined && (
        <KeepsakeLine keepsake={entry.keepsake} />
      )}
      {entry.result === 'fight' && entry.supply === true && <p class="dnd-line">{SUPPLY_LINE}</p>}
    </div>
  );
}

function PlainBody({
  node,
  entry,
  children,
}: {
  node: DungeonMapNode;
  entry: DungeonStepLog | undefined;
  children?: ComponentChildren;
}) {
  const help = nodeGlossaryEntry(node.kind);
  return (
    <div class="dnd-plain">
      {node.kind === 'mystery' && node.event !== undefined && (
        <p class="dnd-event pix">{node.event.name}</p>
      )}
      {/* A room the run has been in says what happened there, not what it might be. */}
      {entry === undefined &&
        nodeLines(node).map((line) => (
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
  entry,
  children,
}: {
  node: DungeonMapNode;
  landmark: boolean;
  /** How the run's fight here ended: the HP line and a Cleared or Defeat tag follow it. */
  entry: Extract<DungeonStepLog, { result: 'fight' }> | undefined;
  children?: ComponentChildren;
}) {
  const foe = node.foe;
  if (foe === undefined) return null;
  const art = bossArt(foe.id);
  const trick = roomTrick({ kind: foe.kind, foe }, landmark);
  const modifier = node.modifier;
  const elite = node.kind === 'elite' || foe.elite;
  return (
    <div class="dnd-foe">
      <div class={`dnd-top ${elementClass(foe.element)}`}>
        <div class="dnd-art" aria-hidden="true">
          <Sprite sprite={art.sprite} scale={art.scale} />
        </div>
        <div class="dnd-who">
          <p class="dnd-name pix">{foeDisplayName(node)}</p>
          <p class="dnd-tags">
            {elite && (
              <Tag tone="bad" entry="elite">
                Elite
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
      {elite && entry === undefined && (
        <p class="dnd-line">
          A fiercer fight. Win it to earn a{' '}
          <GlossaryTag entry="keepsake" look="text">
            keepsake
          </GlossaryTag>
          .
        </p>
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
