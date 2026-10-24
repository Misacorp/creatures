import { GLOSSARY_IDS, content, type Gimmick } from '@creatures/game';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  laneOfIndex,
  paceOfPacing,
  type EventNames,
  type FightBoard,
  type FightEvent,
  type Zone,
} from '@creatures/engine';
import { bossArt, elementClass } from './art';
import { cssVars } from './css-vars';
import { foeInfoOf, foeElement } from './foe-info';
import { GlossaryTag } from './Glossary';
import { gimmickGlyph, glyphOrUnknown } from './glyphs';
import { useElementWidth, usePrefersReducedMotion } from './hooks';
import { abilityName, abilityTitle } from './live';
import { scrollToLanes } from './lane-scroll';
import type { RaidPhaseId, ReplayRowEntry } from './raid-api';
import { boardRows, laneStates, ownLaneSpan } from './raid-board';
import { stateAt } from './replay';
import { enrageLine, retreatLine } from './raid-text';
import {
  abilityUsesAt,
  actingSlots,
  cuesForEvents,
  creatureHpAt,
  enragedAt,
  creatureAtSlot,
  groupByZone,
  pendingChargesAt,
  retreatedAt,
  stageStateAt,
  strikeRows,
  type AbilityUse,
} from './stage';
import { unitTap, usedBadge, type Badge } from './stage-abilities';
import { compactPair } from './number-format';
import { ElementChip } from './sprites/ElementChip';
import { shortEffectMs, type FxItem, type IntroView } from './stage-fx';
import { roundLabel } from './stage-rounds';
import { bossOrFoe, forecastNextRound, type Wording } from './telegraph';
import { moveTrack } from './move-track';
import { MoveTrack, type TrackLook } from './stage/MoveTrack';
import { Barrier } from './stage/Barrier';
import { barrierLookOf } from './move-fx';
import { Popover, popupProps } from './ui/Popover';
import { SegmentBar } from './ui/SegmentBar';
import { StageHead, type StageModifier } from './ui/StageHead';
import { ToggleButton } from './ui/ToggleButton';
import { Sprite } from './sprites/Sprite';
import { elementIcon } from './sprites/element-icons';
import { Bursts, Floats, RoundIntro, fxRef, nameOf } from './stage/StageFx';
import { BossFx } from './stage/BossFx';
import { EffectIcons } from './ui/EffectIcons';
import { AbilityBadge, CreatureTags, FoeFace, StageUnit } from './stage/StageUnit';
import { useLiveStage, type Anim } from './use-live-stage';
import { useStageAbilities, type StageAbilities } from './use-stage-abilities';
import { GRID_SCALE, ROW_LAYOUT, STAGE_FALLBACK_PX, layoutVars, zoneLayout } from './zone-layout';

export type { Anim } from './use-live-stage';

const ZONE_NAMES: Record<Zone, string> = { front: 'Front', middle: 'Middle', back: 'Back' };
/** In a single row each zone is one creature, named by where it stands. */
const PLACE_NAMES: Record<Zone, string> = { front: 'Left', middle: 'Middle', back: 'Right' };

/** A "Log" button that opens the plain-text feed. Closed by default: the stage shows the fight. */
export function LogToggle({ id, children }: { id: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return (
    <section class="stage-log" aria-label="Fight log">
      <ToggleButton
        pressed={open}
        controls={id}
        onToggle={() => {
          setOpen(!open);
        }}
      >
        {open ? 'Hide log' : 'Log'}
      </ToggleButton>
      <div id={id} hidden={!open}>
        {open && children}
      </div>
    </section>
  );
}

/** After the player scrolls the raid grid by hand, it is left alone for this long. */
const HAND_SCROLL_HOLD_MS = 4000;

/** At most this many ability cards show at once; the rest are counted ("+3 more"). */
const MAX_ABILITY_CARDS = 4;

interface StageProps {
  /**
   * The foe or boss: its content id, its name and, when the server sent it, its element (the content's
   * own is used otherwise). The element shows as a chip after the name; tapping the picture opens its
   * popover.
   */
  boss: {
    id: string;
    name: string;
    element?: string;
    /** The boss's own retreat lines, when the server sent them. */
    retreat?: { phase1: string; phase2: string } | null;
  };
  hpMax: number;
  hpStart: number;
  /**
   * The most rounds the fight can last, for "Round 3 / 12" (and for the forecast): the content's
   * limit (`roomMaxRounds`, `raidMaxRounds`), never how long this stored fight really lasted, which
   * would spoil it. Null when the fight has no known limit: the head then says just "Round 3".
   */
  rounds: number | null;
  /** The row, left to right. */
  row: readonly ReplayRowEntry[];
  /** Where the row stands on the board (the fight's own); absent: the dense row. */
  board?: FightBoard;
  /** The lobby's preview: no round yet, so the head says to get ready instead of "Round 1". */
  lobby?: boolean;
  /** The creatures that are the player's own: they are outlined and marked "you". */
  mineIds: ReadonlySet<string>;
  names: EventNames;
  events: readonly FightEvent[];
  /** How many events have happened. */
  index: number;
  /** The newest beat, for the short animations: events [from, to) of the log. Null: no movement. */
  anim: Anim | null;
  /** Effects that stay on screen longer than their beat (numbers, bursts, ability cards, knockouts). */
  fx?: readonly FxItem[];
  /** The "Round N" overlay, while a round opens. */
  intro?: IntroView | null;
  /**
   * The creatures' own HP (the dungeon: their HP carries between rooms, and a creature that is hit is
   * hurt, not only knocked out). It gives each creature a small HP bar that follows the boss hits in
   * the events, from the HP it started the fight with. Without it (the raid) the stage draws none.
   */
  creatureHp?: { start: Readonly<Record<string, number>>; max: Readonly<Record<string, number>> };
  /**
   * `zones` (the raid): the zones are rows under the boss, front first. `row` (the dungeon): the
   * creatures stand side by side in one row, left to right, with no zone labels; each zone is the
   * one creature at that place, so its effects (shake, shield, wind-up frame) sit on that creature.
   */
  layout?: 'zones' | 'row';
  /**
   * Where in the run the fight is, top left of the stage's head: "Room 1 / 3" in the dungeon,
   * "Phase 1 / 3" or "Finale" in the raid. The round is at the top right.
   */
  place?: string;
  /** The room's modifiers, as small tags after the place in the head (the dungeon). */
  modifiers?: readonly StageModifier[];
  /**
   * The raid phase being shown, for the line the boss says when it retreats at the phase's floor
   * (Phase 1: "back in Phase 2"). Absent (the finale, the dungeon): the line does not name a phase.
   */
  phase?: RaidPhaseId;
  /** Gimmicks the foe has only in this room (the dungeon's modifier), so the forecast names them too. */
  addedGimmicks?: readonly Gimmick[];
  /** How the boss's move track looks (the design rounds' looks; default `rows`). */
  trackLook?: TrackLook;
  /**
   * Something drawn over the whole stage, above the round intro (the dungeon's room banner). It sits
   * inside the stage's own box, so the stage keeps its size while it shows.
   */
  overlay?: ComponentChildren;
  /**
   * The live finale's abilities: the player's own creatures with an ability get a badge and open a
   * popover when tapped. Without it (replays) the stage is not interactive and only shows which
   * abilities have been used so far.
   */
  abilities?: StageAbilities;
}

/**
 * The fight stage: the boss on top with its HP bar, then the creatures under it. In the raid they are
 * a grid like the placement board: Front, Middle and Back are three lines that never wrap, a lane is
 * a column, the row names stay at the left and the lines scroll sideways together. Before the fight
 * the grid shows the viewer's own creatures; as it plays it follows the creature that acts (the
 * smooth scroll is instant under `prefers-reduced-motion`, and waits a few seconds after the player
 * scrolls it by hand). The dungeon's `single` row is three creatures side by side. It shows the state after `index`
 * events and animates the beat `anim`: hops, white flashes, floating numbers, reaction bursts,
 * the mark, knockouts, zone frames and ability cards. Everything is drawn from the event log; the
 * animation classes are only decoration, and `prefers-reduced-motion` (in styles/stage/motion.css) turns them
 * into outlines and instant changes.
 */
export function Stage({
  boss,
  hpMax,
  hpStart,
  rounds,
  row,
  board,
  lobby,
  mineIds,
  names,
  events,
  index,
  anim,
  fx: allFx = [],
  intro = null,
  creatureHp,
  layout = 'zones',
  place,
  modifiers,
  phase,
  addedGimmicks,
  trackLook,
  overlay,
  abilities,
}: StageProps) {
  const single = layout === 'row';
  const wording: Wording = single ? 'row' : 'zones';
  const rowsRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(rowsRef, STAGE_FALLBACK_PX);
  /** The layer the strikes' beams are drawn in, the boss and each creature's box (for the beams to find). */
  const layerRef = useRef<HTMLDivElement>(null);
  const bossRef = useRef<HTMLDivElement>(null);
  const boxes = useRef(new Map<string, HTMLElement>());
  const boxRef = (id: string) => (el: HTMLElement | null) => {
    if (el === null) boxes.current.delete(id);
    else boxes.current.set(id, el);
  };
  const rowIds = row.map((c) => c.id);
  const state = stageStateAt(events, index, hpStart);
  // The acting order written under the creatures. The dungeon always acts left to right; the raid's
  // order varies by boss, so it follows the engine's own turn and skip events for the round on show.
  const slots = actingSlots(
    events,
    state.round,
    rowIds,
    single,
    content.bosses.find((b) => b.id === boss.id)?.turnOrder === 'serpentine'
      ? { board, knockedOut: state.knockedOut }
      : undefined,
  );
  const cues =
    anim === null
      ? []
      : cuesForEvents(events, anim.from, Math.min(anim.to, index), rowIds, boss.id, board);
  // The dungeon passes its creatures' HP; a raid's comes with its row (once the fight is known).
  const rowHp = row.every((c) => c.hp !== undefined && c.hp !== null)
    ? {
        start: Object.fromEntries(row.map((c) => [c.id, c.hp?.start ?? 0])),
        max: Object.fromEntries(row.map((c) => [c.id, c.hp?.max ?? 0])),
      }
    : undefined;
  const hpOf = creatureHp ?? (row.length > 0 ? rowHp : undefined);
  const creatureHpNow = hpOf === undefined ? {} : creatureHpAt(events, index, hpOf.start);
  // Every number shows: when a move hits a whole row, they may overlap (Misa, 2026-10-22).
  const fx = allFx;
  // Charged attacks that are announced and have not landed: their victims and rows stay marked.
  const pending = pendingChargesAt(events, index);
  const chargedIds = new Set(pending.flatMap((c) => c.marks));
  const chargedRows = new Set(pending.flatMap((c) => c.rows));
  const enraged = enragedAt(events, index);
  const retreated = retreatedAt(events, index);
  const previousHp = anim === null ? state.bossHp : stateAt(events, anim.from, hpStart).bossHp;
  const art = bossArt(boss.id);
  // What the foe's popover tells, from the content: its element, HP, line and what it does.
  const foe = foeInfoOf({
    id: boss.id,
    name: boss.name,
    element: boss.element ?? foeElement(boss.id) ?? undefined,
    hp: hpMax,
    ...(addedGimmicks === undefined ? {} : { added: addedGimmicks }),
    wording,
  });

  const hopping = new Set<string>();
  const hit = new Set<string | null>();
  const dropped = new Set<string>();
  const silenced = new Set<string>();
  const shaking = new Set<Zone>();
  const markCue = cues.some((c) => c.kind === 'mark');
  for (const cue of cues) {
    if (cue.kind === 'hop') hopping.add(cue.creature);
    else if (cue.kind === 'flash') hit.add(cue.target);
    else if (cue.kind === 'ko') dropped.add(cue.creature);
    else if (cue.kind === 'silenced') silenced.add(cue.creature);
    else if (cue.kind === 'shake') shaking.add(cue.zone);
  }
  const abilityCards = fx.filter((i) => i.cue.kind === 'ability');
  const bannerItem = fx.filter((i) => i.cue.kind === 'banner').at(-1);
  // The boss leans in while it winds up, and the label of its newest hit shows in the boss's line.
  const windupItem = fx.find((i) => i.cue.kind === 'windup');
  // The move track: the boss's special moves in the boxes of the rounds they come in (move-track.ts).
  const trackBoss = bossOrFoe(boss.id, addedGimmicks ?? [], names.gimmicks);
  // Nothing is coming once the fight is over: the foe is down, every creature is, or the last round ended.
  const lastEvent = state.index > 0 ? events[state.index - 1] : undefined;
  const over =
    state.bossHp <= 0 ||
    (row.length > 0 && state.knockedOut.length >= row.length) ||
    (rounds !== undefined &&
      rounds !== null &&
      state.round >= rounds &&
      lastEvent?.t === 'round_end');
  const track =
    over || trackBoss === undefined || trackBoss.gimmicks.length === 0
      ? null
      : moveTrack(trackBoss, state.round, rounds ?? trackBoss.finaleRounds, names.gimmicks ?? {});
  // One round ahead: what the boss will do next round, from its content and the round number.
  const forecast = forecastNextRound(
    boss.id,
    state.round,
    rounds,
    rowIds,
    state.knockedOut,
    names,
    wording,
    addedGimmicks,
    board,
  );

  // The abilities that have been played so far, by key and by creature.
  const uses = abilityUsesAt(events, index);
  const useByKey = new Map<string, AbilityUse>(uses.map((u) => [u.key, u]));
  const useByCreature = new Map<string, AbilityUse>();
  for (const u of uses) if (u.creature !== null) useByCreature.set(u.creature, u);

  const {
    own,
    ownInfo,
    basics,
    openKey,
    openAbility,
    openNote,
    anchors,
    anchorRef,
    close,
    toggle,
  } = useStageAbilities({ abilities, row, useByKey });

  const parity = anim === null ? 0 : anim.seq % 2;
  // The raid's rows are the board's rows, cell for cell: a creature stands in its own board slot and
  // an empty board slot is an empty cell (null), so a lane is the same column as on the placement board.
  const rows = boardRows(board?.length ?? row.length);
  const groups: { zone: Zone; items: (ReplayRowEntry | null)[] }[] = single
    ? groupByZone(row, board)
    : rows.map(({ zone, slots }) => ({
        zone,
        items: slots.map((slot) => creatureAtSlot(row, board, slot) ?? null),
      }));
  const lanes = rows.reduce((most, r) => Math.max(most, r.slots.length), 0);

  // Keep the creature that acts in view (the raid's grid scrolls sideways); before the fight starts
  // show the viewer's own creatures. A hand-scroll holds the auto-scroll back for a few seconds.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const handScrolledAt = useRef(0);
  const started = state.round > 0;
  useLayoutEffect(() => {
    if (single) return;
    if (!started) {
      const own = ownLaneSpan(
        laneStates(rows, (slot) => {
          const c = creatureAtSlot(row, board, slot);
          return c === undefined ? null : mineIds.has(c.id) ? 'mine' : 'other';
        }),
      );
      if (own !== null)
        scrollToLanes(scrollerRef.current, own.first, own.last, { smooth: false, follow: false });
      return;
    }
    if (state.actor === null || Date.now() - handScrolledAt.current < HAND_SCROLL_HOLD_MS) return;
    const at = row.findIndex((c) => c.id === state.actor);
    if (at >= 0) {
      const lane = laneOfIndex(at, board ?? row.length);
      scrollToLanes(scrollerRef.current, lane, lane, {
        smooth: !reduced,
        follow: true,
      });
    }
  }, [single, started, state.actor, row.length]);
  const markName = state.mark === null ? null : nameOf(names.marks, state.mark);
  const markId = content.reactions.find((r) => r.markElement === state.mark)?.markId;
  const markIcon = state.mark === null ? undefined : elementIcon(state.mark);
  const shieldGlyph = glyphOrUnknown('shield');
  const abilityGlyph = glyphOrUnknown('ability');
  const zoneNodes = groups.map(({ zone, items }) => {
    const fresh = fx.filter((i) => i.cue.kind === 'zone' && i.cue.zone === zone);
    const freshShield = fresh.find((f) => f.cue.kind === 'zone' && f.cue.effect === 'shield');
    const walled = state.shielded.includes(zone);
    const zoneName = single ? PLACE_NAMES[zone] : ZONE_NAMES[zone];
    // The single row: all the creatures share one size, picked for the whole row. The raid's grid
    // has one fixed tile (see styles/stage/stage-grid.css), so nothing is measured for it.
    const layoutOf = single ? zoneLayout(row.length, width, ROW_LAYOUT) : null;
    const scale = layoutOf === null ? GRID_SCALE : layoutOf.tier.scale;
    const zoneWindup = fx.filter(
      (i) => i.cue.kind === 'windup' && strikeRows(i.cue.strike).includes(zone),
    );
    const zoneCharged = chargedRows.has(zone);
    const warnedZone = forecast?.zones.includes(zone) === true;
    return (
      <div
        key={zone}
        class={`stage-zone zone-${zone}${shaking.has(zone) ? ' shake' : ''}${warnedZone ? ' warned' : ''}${zoneCharged ? ' charged' : ''}`}
        role="group"
        aria-label={single ? zoneName : `${zoneName} zone`}
        // `--art`: a creature sprite's height, so its effect icons sit on the sprite, not on its name.
        ref={cssVars({
          ...(layoutOf === null ? {} : layoutVars(layoutOf, ROW_LAYOUT)),
          '--art': `${String(16 * scale)}px`,
        })}
      >
        {single && warnedZone && (
          <span class="zone-warn" aria-hidden="true">
            <Sprite sprite={glyphOrUnknown('warning')} scale={2} />
          </span>
        )}
        {single && zoneCharged && (
          <span class="zone-charge" aria-hidden="true">
            <Sprite sprite={glyphOrUnknown('charge')} scale={2} />
          </span>
        )}
        <ul class="zone-units">
          {items.map((c, cell) => {
            if (c === null)
              return <li key={`gap-${String(cell)}`} class="stage-gap" aria-hidden="true" />;
            const mine = mineIds.has(c.id);
            const ko = state.knockedOut.includes(c.id);
            const classes = ['stage-unit'];
            if (mine) classes.push('mine');
            if (ko) classes.push('ko');
            if (hopping.has(c.id)) classes.push('actor');
            if (state.actor === c.id) classes.push('acting');
            if (hit.has(c.id)) classes.push('hit');
            if (dropped.has(c.id)) classes.push('drop');
            if (silenced.has(c.id)) classes.push('silenced');
            if (chargedIds.has(c.id) && !ko) classes.push('charged');

            // The player's own creature with an ability is a button with a badge; every
            // other creature only shows a "used" mark once its ability has fired.
            const mineAbility = own.find((a) => a.creature === c.id);
            const used = useByCreature.get(c.id) ?? null;
            let badge: Badge | null = null;
            let abilityId: string | null = null;
            if (mineAbility !== undefined) {
              abilityId = mineAbility.abilityId;
              badge = ownInfo(mineAbility).badge;
            } else if (used !== null) {
              abilityId = used.ability;
              badge = usedBadge(used.round);
            }
            // Your own creatures are always buttons: the ability popover, or a note on why
            // there is no ability (the note needs the screen to supply its text).
            const tap = unitTap(mine && abilities !== undefined, mineAbility !== undefined);
            let key: string | null = null;
            if (tap === 'ability' && mineAbility !== undefined) key = `a:${mineAbility.key}`;
            else if (tap === 'note' && abilities?.renderNote !== undefined) key = `c:${c.id}`;
            return (
              <StageUnit
                key={c.id}
                creature={c}
                scale={scale}
                mine={mine}
                ko={ko}
                classes={classes}
                silenced={silenced.has(c.id)}
                fx={fx}
                names={names}
                badge={badge}
                abilityId={abilityId}
                interactive={key !== null}
                opens={
                  tap === 'note' ? 'Opens a note about its ability.' : 'Opens the ability options.'
                }
                open={key !== null && openKey === key}
                anchorRef={anchorRef(key ?? `none:${c.id}`)}
                boxRef={boxRef(c.id)}
                warned={forecast?.ends.includes(c.id) === true}
                charged={chargedIds.has(c.id)}
                hp={
                  hpOf === undefined
                    ? null
                    : {
                        current: creatureHpNow[c.id] ?? 0,
                        max: hpOf.max[c.id] ?? 0,
                      }
                }
                hpBar={single ? 'segments' : 'tiny'}
                slot={slots.get(c.id) ?? null}
                effects={state.creatureEffects[c.id] ?? []}
                onToggle={() => {
                  if (key !== null) toggle(key);
                }}
              />
            );
          })}
        </ul>
        {walled && (
          <span
            class={`zone-fx fx-shield${freshShield === undefined ? '' : ' fresh'}`}
            aria-hidden="true"
            {...(freshShield === undefined ? {} : { ref: fxRef(freshShield) })}
          >
            <Sprite sprite={shieldGlyph} scale={2} />
          </span>
        )}
        {fresh.map((item) => {
          const f = item.cue;
          if (f.kind !== 'zone' || (f.effect === 'shield' && walled)) return null;
          const icon =
            f.effect === 'shield'
              ? shieldGlyph
              : f.effect === 'rally'
                ? abilityGlyph
                : gimmickGlyph('hit_zone');
          return (
            <span
              key={`${String(f.i)}-${f.effect}`}
              class={`zone-fx fx-${f.effect} fresh`}
              aria-hidden="true"
              ref={fxRef(item)}
            >
              {f.effect === 'hit' && <span class="strike-wave" />}
              <Sprite sprite={icon} scale={2} />
            </span>
          );
        })}
        {zoneWindup.map((item) => (
          <span
            key={`windup-${String(item.cue.i)}`}
            class="zone-fx fx-windup"
            aria-hidden="true"
            ref={fxRef(item)}
          />
        ))}
      </div>
    );
  });
  return (
    <section
      class={`stage p${String(parity)}${single ? ' single' : ''}`}
      aria-label="Fight stage"
      ref={cssVars({
        '--beat': `${String(anim === null ? 600 : shortEffectMs(anim.ms))}ms`,
        '--lean-ms': `${String(windupItem?.ms ?? 600)}ms`,
      })}
    >
      <StageHead
        {...(place === undefined ? {} : { place })}
        {...(modifiers === undefined ? {} : { modifiers })}
        round={
          state.round > 0
            ? roundLabel(state.round, rounds)
            : lobby === true
              ? 'Get ready'
              : roundLabel(1, rounds)
        }
      >
        {abilities?.help !== undefined && (
          <button
            type="button"
            ref={anchorRef('help')}
            class="stage-help pix"
            {...popupProps(openKey === 'help')}
            aria-label="How abilities work"
            onClick={() => {
              toggle('help');
            }}
          >
            ?
          </button>
        )}
      </StageHead>

      <div class="stage-boss">
        <div class="stage-boss-row">
          {track !== null && (
            <MoveTrack
              track={track}
              round={state.round}
              {...(trackLook === undefined ? {} : { look: trackLook })}
            />
          )}
          <div
            ref={bossRef}
            class={`stage-boss-art${hit.has(null) ? ' hit' : ''}${windupItem === undefined ? '' : ' windup'}${retreated ? ' retreated' : ''}${enraged ? ' enraged' : ''}`}
          >
            <FoeFace info={foe}>
              <Sprite sprite={art.sprite} scale={art.scale} />
            </FoeFace>
            {state.barrier !== null && (
              <Barrier
                key={`${String(state.barrier.round)}-${state.barrier.broken === null ? 'up' : 'broken'}`}
                barrier={state.barrier}
                look={barrierLookOf(
                  state.barrier.gimmick,
                  foe.element === 'unknown' ? null : foe.element,
                )}
              />
            )}
            {state.mark !== null && (
              <span class={`stage-mark ${elementClass(state.mark)}${markCue ? ' pop' : ''}`}>
                {/* The boss is not a button, so the mark can be a tag without taking a tap from anything. */}
                <GlossaryTag
                  entry={markId === undefined ? '' : GLOSSARY_IDS.mark(markId)}
                  look="chip"
                  class="mark-tag"
                  label={`Marked: ${markName ?? state.mark}. What does this mean?`}
                >
                  {/* The element's icon and the mark's name say it: no "marked" glyph (Misa, 2026-10-24). */}
                  {markIcon !== undefined && <Sprite sprite={markIcon} scale={2} />}
                  <span class="stage-mark-name">{markName}</span>
                </GlossaryTag>
              </span>
            )}
            <Floats fx={fx} target={null} />
            <Bursts fx={fx} target={null} names={names} />
            {bannerItem?.cue.kind === 'banner' && (
              <span
                key={`banner-${String(bannerItem.cue.i)}`}
                class="stage-callout banner"
                aria-hidden="true"
                ref={fxRef(bannerItem)}
              >
                <span class="pix">{bannerItem.cue.text}</span>
              </span>
            )}
          </div>
          <div class="boss-effects">
            <EffectIcons effects={state.bossEffects} names={names} only="buff" />
            <EffectIcons effects={state.bossEffects} names={names} only="debuff" />
          </div>
        </div>
        <div class="stage-foe-line">
          <p class="stage-foe-name pix">{boss.name}</p>
          {foe.element !== 'unknown' && <ElementChip element={foe.element} context="boss" />}
        </div>
        <SegmentBar
          size="boss"
          current={state.bossHp}
          max={hpMax}
          previous={previousHp}
          label={`${boss.name} HP: ${String(state.bossHp)} / ${String(hpMax)}`}
          text={compactPair(state.bossHp, hpMax)}
        />
        {enraged && (
          <p class="enrage-banner" role="note">
            <GlossaryTag entry="enrage" class="enrage-title pix">
              Enraged
            </GlossaryTag>
            <span class="enrage-line">{enrageLine(boss.name)}</span>
          </p>
        )}
        {retreated && (
          <p class="retreat-line" role="note">
            <GlossaryTag entry="retreat" class="retreat-title pix">
              Immune
            </GlossaryTag>
            <span>{retreatLine(boss.id, boss.name, phase, boss.retreat)}</span>
          </p>
        )}
      </div>

      <div class="stage-abilities-slot">
        <ul class="stage-abilities" aria-label="Abilities that just fired">
          {abilityCards.slice(0, MAX_ABILITY_CARDS).map((item) =>
            item.cue.kind === 'ability' ? (
              <li key={`ability-${String(item.cue.i)}`} class="stage-ability" ref={fxRef(item)}>
                <Sprite sprite={abilityGlyph} scale={2} />
                <span class="pix">
                  {abilityTitle(
                    { abilityId: item.cue.ability, creature: item.cue.creature },
                    names,
                  )}
                </span>
              </li>
            ) : null,
          )}
          {abilityCards.length > MAX_ABILITY_CARDS && (
            <li class="stage-ability more">
              <span class="pix">+{abilityCards.length - MAX_ABILITY_CARDS} more</span>
            </li>
          )}
        </ul>
      </div>

      <div
        class={single ? 'stage-rows single-row' : 'stage-rows'}
        ref={rowsRef}
        role="group"
        aria-label={single ? 'Your team, left to right' : 'Zones, front to back'}
      >
        {single ? (
          zoneNodes
        ) : (
          <div class="board-grid stage-grid">
            <div class="board-labels">
              <p class="board-lane-head" aria-hidden="true">
                Lane
              </p>
              {groups.map(({ zone }) => {
                const warned = forecast?.zones.includes(zone) === true;
                return (
                  <p key={zone} class={`zone-label board-label pix${warned ? ' warned' : ''}`}>
                    <GlossaryTag entry={GLOSSARY_IDS.zone(zone)}>{ZONE_NAMES[zone]}</GlossaryTag>
                    {warned && (
                      <span class="zone-warn" aria-hidden="true">
                        <Sprite sprite={glyphOrUnknown('warning')} scale={2} />
                      </span>
                    )}
                    {chargedRows.has(zone) && (
                      <span class="zone-warn charge" aria-hidden="true">
                        <Sprite sprite={glyphOrUnknown('charge')} scale={2} />
                      </span>
                    )}
                  </p>
                );
              })}
            </div>
            <div
              ref={scrollerRef}
              class="party-strip board-scroller"
              role="group"
              aria-label="Party grid: rows front to back, lanes left to right"
              onPointerDown={() => {
                handScrolledAt.current = Date.now();
              }}
              onWheel={() => {
                handScrolledAt.current = Date.now();
              }}
            >
              <div class="board-lanes" aria-hidden="true">
                {Array.from({ length: lanes }, (_, lane) => (
                  <span key={lane} class="board-lane" data-lane={lane}>
                    {lane + 1}
                  </span>
                ))}
              </div>
              {zoneNodes}
            </div>
          </div>
        )}
      </div>

      {abilities !== undefined && basics.length > 0 && (
        <div class="stage-foot">
          {basics.map((ability) => {
            const { badge } = ownInfo(ability);
            const key = `a:${ability.key}`;
            return (
              <button
                key={ability.key}
                type="button"
                ref={anchorRef(key)}
                class="basic-chip"
                {...popupProps(openKey === key)}
                aria-label={`${abilityName(ability.abilityId)} (basic ability), ${badge.label.toLowerCase()}. Opens the ability options.`}
                onClick={() => {
                  toggle(key);
                }}
              >
                <Sprite sprite={abilityGlyph} scale={2} />
                <span class="pix">{abilityName(ability.abilityId)}</span>
                <AbilityBadge badge={badge} />
              </button>
            );
          })}
        </div>
      )}

      {abilities !== undefined && openAbility !== undefined && (
        <Popover
          key={openKey}
          anchor={() => anchors.current.get(`a:${openAbility.key}`) ?? null}
          label={`${abilityName(openAbility.abilityId)} ability`}
          onClose={close}
        >
          {abilities.renderPopover(openAbility, ownInfo(openAbility).badge, close)}
          <CreatureTags creature={row.find((c) => c.id === openAbility.creature)} />
        </Popover>
      )}
      {abilities?.renderNote !== undefined && openNote !== undefined && (
        <Popover
          key={openKey}
          anchor={() => anchors.current.get(`c:${openNote.id}`) ?? null}
          label={`${openNote.name}`}
          onClose={close}
        >
          {abilities.renderNote(openNote, close)}
          <CreatureTags creature={openNote} />
        </Popover>
      )}
      {abilities?.help !== undefined && openKey === 'help' && (
        <Popover
          key="help"
          anchor={() => anchors.current.get('help') ?? null}
          label="How abilities work"
          onClose={close}
        >
          {abilities.help}
        </Popover>
      )}
      <div class="stage-strikes" ref={layerRef} aria-hidden="true">
        {fx.map((item) => {
          const { cue } = item;
          if ((cue.kind !== 'windup' && cue.kind !== 'strike') || item.ms === 0) return null;
          return (
            <BossFx
              key={`${cue.kind}-${String(cue.i)}`}
              phase={cue.kind === 'windup' ? 'windup' : 'impact'}
              strike={cue.strike}
              seed={cue.i}
              ms={item.ms}
              element={foe.element === 'unknown' ? null : foe.element}
              layer={layerRef}
              boss={() => bossRef.current}
              unit={(id) => boxes.current.get(id) ?? null}
              zone={(z) =>
                layerRef.current?.parentElement?.querySelector<HTMLElement>(
                  `.stage-zone.zone-${z}`,
                ) ?? null
              }
            />
          );
        })}
      </div>
      {intro !== null && <RoundIntro intro={intro} />}
      {overlay}
    </section>
  );
}

/**
 * The stage of the live finale: when a poll brings a new round it opens with "Round N", then steps
 * through the round's beats, and shows the state the server reports. Effects overlap the beats (see
 * `useLiveStage`). `hold` keeps it waiting while the countdown's "FIGHT!" is on screen.
 */
export function LiveStage(
  props: Omit<StageProps, 'index' | 'anim' | 'fx' | 'intro'> & {
    hold?: boolean;
    /** The fight's pacing version from the server (`paceOfPacing`). */
    pacing: number;
  },
) {
  const { hold, pacing, ...rest } = props;
  const reduced = usePrefersReducedMotion();
  const view = useLiveStage(
    props.events,
    props.row.map((c) => c.id),
    props.boss.id,
    props.rounds,
    reduced,
    hold === true,
    props.board,
    paceOfPacing(pacing),
  );
  return <Stage {...rest} index={view.index} anim={view.anim} fx={view.fx} intro={view.intro} />;
}
