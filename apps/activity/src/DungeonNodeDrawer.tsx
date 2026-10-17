import { GLOSSARY_IDS } from '@creatures/game';
import { bossArt, elementClass } from './art';
import {
  LOCKED_LINE,
  NO_TRICK_LINE,
  canGo,
  foeDisplayName,
  hpLine,
  nodeGlossaryEntry,
  nodeLabel,
  nodeLines,
  nodeStatus,
  nodeTitle,
} from './dungeon-map';
import { modifierIcon } from './dungeon-rooms';
import { roomTrick } from './dungeon-playback';
import type { DungeonMapNode, DungeonRunState } from './dungeon-types';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { gimmickGlyphKey, gimmickShort } from './raid-text';
import { Sprite } from './sprites/Sprite';
import { ElementChip } from './sprites/ElementChip';
import { Drawer } from './ui/Drawer';
import { Tag } from './ui/Tag';

interface Props {
  /** The room that was tapped, or null while the drawer is shut. */
  node: DungeonMapNode | null;
  state: DungeonRunState | null;
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
 * closes the sheet and calls `onGo`; a room off the path says so; the preview has no footer.
 */
export function DungeonNodeDrawer({
  node,
  state,
  onGo,
  busy = false,
  landmark,
  onClose,
  returnFocusTo,
}: Props) {
  if (node === null) return null;
  const status = nodeStatus(node, state);
  const go = onGo !== undefined && canGo(node, state);
  const blocked = state !== null && state.status === 'active' && status === 'locked';
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
  ) : blocked ? (
    <p class="muted dnd-blocked">{LOCKED_LINE}</p>
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
        <FoeBody node={node} landmark={state?.landmark ?? landmark ?? false} />
      ) : (
        <PlainBody node={node} />
      )}
    </Drawer>
  );
}

function PlainBody({ node }: { node: DungeonMapNode }) {
  const help = nodeGlossaryEntry(node.kind);
  return (
    <div class="dnd-plain">
      {node.kind === 'mystery' && node.event !== undefined && (
        <p class="dnd-event pix">{node.event.name}</p>
      )}
      {nodeLines(node).map((line) => (
        <p key={line} class="dnd-line">
          {line}
        </p>
      ))}
      {help !== null && (
        <p class="dnd-help">
          <GlossaryTag entry={help} look="help" />
        </p>
      )}
    </div>
  );
}

function FoeBody({ node, landmark }: { node: DungeonMapNode; landmark: boolean }) {
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
          </p>
          <p class="dnd-hp pix">{hpLine(foe.hpMax)}</p>
        </div>
      </div>
      {elite && (
        <p class="dnd-line">
          A fiercer fight. Win it to earn a{' '}
          <GlossaryTag entry="keepsake" look="text">
            keepsake
          </GlossaryTag>
          .
        </p>
      )}
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
