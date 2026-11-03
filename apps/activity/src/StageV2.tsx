/**
 * The fight stage of combat v2 (docs/design/combat/integration.md, section 9): the boss above its HP bar, the marks under it, then the v2
 * board (`ui/RaidBoard`, the same tiles as the Raid tab) with each creature's HP and state, played beat by beat. Everything is drawn from
 * the board state the fold gives (`fight-v2.ts`), never from log text; the beat that just landed adds the short animations (a flash on
 * whoever was hit, the numbers floating, the boss's attack). Names are drawn as text only. The replay and the live finale both draw this.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { bossArt } from './art';
import { ArmourChip, EscalatingMeter, boardTurnSteps, stageTicks } from './BossCardV2';
import { combatGlyph, moveGlyphId } from './combat-glyphs';
import { actionActive, stepId, type BoardState, type StageModel } from './fight-v2';
import type { FightBossV2, FightCreatureV2, FightNamesV2 } from './fight-v2-api';
import { glyphOrUnknown } from './glyphs';
import { cssVars } from './css-vars';
import { usePrefersReducedMotion } from './hooks';
import { scrollToLanes } from './lane-scroll';
import { compactPair } from './number-format';
import { usePopoverHost } from './PopoverHost';
import { elementName } from './game';
import { rowNameV2, slotAtV2, gridRowsV2 } from './raid-board-v2';
import { initialOf } from './raid-roster';
import { ownerColour } from './raid-slots';
import type { BossCardV2 } from './raid-v2-api';
import { roundLabel } from './stage-rounds';
import type { FxItem } from './stage-fx';
import type { BossStrike } from './stage';
import { BossFx } from './stage/BossFx';
import { KoTags, RoundIntro, fxRef } from './stage/StageFx';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { elementIcon } from './sprites/element-icons';
import type { PlaybackV2 } from './use-playback-v2';
import { MarkStrip, type MarkChipModel } from './ui/MarkStrip';
import { RaidBoard, type BoardRowModel } from './ui/RaidBoard';
import type { SlotModel } from './ui/SlotButton';
import type { SlotCue } from './ui/slot-cue';
import { SegmentBar } from './ui/SegmentBar';
import { StageHead } from './ui/StageHead';
import { Tag } from './ui/Tag';
import { TurnStrip } from './ui/TurnStrip';

/** The numbers that float over a creature or the boss: a Blocked hit is the shield and 0, a crit is bigger, in the hit's own colour. */
function FloatsV2({ fx, target }: { fx: readonly FxItem[]; target: string | null }) {
  return (
    <>
      {fx.map((item) => {
        const { cue } = item;
        if (cue.kind !== 'float' || cue.target !== target) return null;
        return (
          <span
            key={`float-${String(cue.i)}`}
            class={`float float-${cue.tone}${cue.crit ? ' crit' : ''} lane-${String(item.lane)}`}
            ref={fxRef(item, { '--drift': cue.drift, '--lane': item.lane })}
          >
            <span class="float-body">
              <span class="float-text">
                {cue.tone === 'blocked' && (
                  <Sprite sprite={glyphOrUnknown('shield')} scale={1} class="float-shield" />
                )}
                {cue.text}
              </span>
            </span>
          </span>
        );
      })}
    </>
  );
}

/** A plain pass-through of a DragDrop for a board nobody drags on. */
const NO_DRAG = {
  drag: null,
  shakeSlot: null,
  ghostRef: { current: null },
  startDrag: () => undefined,
  consumeClick: () => false,
} as const;

interface StageV2Props {
  boss: FightBossV2;
  card: BossCardV2;
  fighters: readonly FightCreatureV2[];
  names: FightNamesV2;
  /** The viewer's opaque owner key in this fight (their creatures are marked), or null. */
  you: string | null;
  model: StageModel;
  playback: PlaybackV2;
  /** Where in the weekend: "Stage 1 / 3" or "Finale". */
  place: string;
  /** The boss's HP when the weekend's stage began, and the weekend's full HP, for the bar. */
  hpMax: number;
  /** The fight's round limit, for "Round 3 / 8". */
  rounds: number | null;
  /** The lobby's preview: no round yet, so the head says to get ready. */
  lobby?: boolean;
  /**
   * The dungeon's one row (R8.7: the line acts, then the foe takes one turn): the board is `ui/RaidBoard`'s single row, centred with no
   * lane header or scroller, the tiles carry no owner (the run is one player's), and the turn strip reads "Team, Foe". Absent: the
   * raid's rows by lanes.
   */
  single?: boolean;
  /**
   * Where each stage of the weekend ends on the boss's HP bar, as shares of the bar. Absent: the raid's two stage goals. A dungeon
   * room has no stages: `[]`.
   */
  ticks?: readonly number[];
  /** Under the board: the live finale's input. */
  children?: ComponentChildren;
  /** Drawn over the whole stage inside its own box (the dungeon's room banner); it lets taps through. */
  overlay?: ComponentChildren;
}

/** The slot of a creature of the fight on the boss's grid (a slot is `col * rows + row`). */
const slotOf = (f: Pick<FightCreatureV2, 'row' | 'col'>, rows: number): number =>
  f.col * rows + f.row;

/**
 * The stage: its head (where in the weekend, the round), the boss (picture, HP bar with a tick per stage, its move when it acts, marks,
 * Mired, what it resists, the Escalating meter), the turn strip lighting the step on, and the board.
 */
export function StageV2({
  boss,
  card,
  fighters,
  names,
  you,
  model,
  playback,
  place,
  hpMax,
  rounds,
  lobby,
  single = false,
  ticks,
  children,
  overlay,
}: StageV2Props) {
  const popovers = usePopoverHost();
  const reduced = usePrefersReducedMotion();
  const stripRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const bossRef = useRef<HTMLDivElement>(null);
  const handScrolledAt = useRef(0);

  const { show, fx, intro } = playback;
  // The step is kept inside the fight (the live finale's list of beats can be shorter than a step played before it was replaced).
  const beat = Math.min(playback.beat, model.states.length - 1);
  const state: BoardState = model.states[beat] as BoardState;
  const before: BoardState = model.states[Math.max(0, beat - 1)] as BoardState;
  const landed = show === null ? undefined : model.beats[beat - 1];
  const rows = boss.rows;
  const cols = Math.max(boss.cols, ...fighters.map((f) => f.col + 1));
  const grid = { rows, cols };
  const playerNames = Object.values(names.players);

  const bySlot = useMemo(
    () => new Map(fighters.map((f) => [slotOf(f, rows), f])),
    [fighters, rows],
  );
  const bySlotKey = useMemo(
    () => new Map(fighters.map((f) => [f.key, slotOf(f, rows)])),
    [fighters, rows],
  );
  const hit = show?.flash ?? new Set<string | null>();

  // The live inputs in play: Rally lights everyone, a Shield Wall its row.
  const actions = state.actions.filter((a) => actionActive(a, state.round) && state.end === null);
  const wallRows = new Set(
    actions.flatMap((a) => (a.kind === 'shieldWall' && a.row !== null ? [a.row] : [])),
  );
  const rallying = actions.some((a) => a.kind === 'rally');

  // The cues on the board: a move announced at round start shows its picture on each creature it will land on.
  const cues = useMemo(() => {
    const out = new Map<number, SlotCue>();
    for (const a of state.announced) {
      const move = card.moves.find((m) => m.id === a.move);
      const glyph = move === undefined ? 'unknown' : moveGlyphId(move);
      for (const [row, col] of a.slots) out.set(slotAtV2(row, col, grid), { hit: { glyph } });
    }
    for (const f of fighters) {
      if (state.creatures[f.key]?.out === true) continue;
      const slot = slotAtV2(f.row, f.col, grid);
      if (wallRows.has(f.row)) out.set(slot, { ...out.get(slot), cover: true });
      else if (rallying) out.set(slot, { ...out.get(slot), buff: true });
    }
    return out;
  }, [state, card, fighters, rows, cols, wallRows.size, rallying]);

  const tileOf = (f: FightCreatureV2): SlotModel['occupant'] => {
    const now = state.creatures[f.key];
    const owner = names.players[f.owner] ?? 'Someone';
    return {
      species: f.species,
      name: f.name,
      level: f.level,
      ownId: null,
      mine: you !== null && f.owner === you,
      element: f.element,
      ...(single ? {} : { owner: { colour: ownerColour(owner, playerNames), initial: initialOf(owner) } }),
      v2: {
        role: f.role,
        knack: f.knackName,
        // A knocked-out creature has no HP to show: it is greyed and struck through.
        carried: now?.out === true ? null : { hp: now?.hp ?? 0, max: f.maxHp },
        fight: {
          silenced: now?.silenced ?? 0,
          out: now?.out === true,
          store: now?.store ?? 0,
          hit: hit.has(f.key),
          acting: landed?.kind === 'creature' && landed.actor === f.key,
          overlay: (
            <>
              <FloatsV2 fx={fx} target={f.key} />
              <KoTags fx={fx} creature={f.key} />
            </>
          ),
        },
      },
    };
  };

  const boardRows: BoardRowModel[] = gridRowsV2(grid).map((row, at) => ({
    zone: row.zone,
    name: rowNameV2(at),
    label: rowNameV2(at),
    slots: row.slots.map((slot): SlotModel => {
      const f = bySlot.get(slot);
      const now = f === undefined ? undefined : state.creatures[f.key];
      const lane = (f?.col ?? Math.floor(slot / rows)) + 1;
      const where = single ? `Place ${String(lane)}` : `${rowNameV2(at)}, lane ${String(lane)}`;
      if (f === undefined)
        return { index: slot, hideNumber: true, ariaLabel: `${where}, empty`, occupant: null };
      const parts = [
        `${where}, ${f.name}`,
        `${String(now?.hp ?? 0)} / ${String(f.maxHp)} HP`,
        ...(now?.out === true ? ['out'] : []),
        ...((now?.silenced ?? 0) > 0 ? [`silenced, ${String(now?.silenced)} turns left`] : []),
      ];
      return { index: slot, hideNumber: true, ariaLabel: parts.join(', '), occupant: tileOf(f) };
    }),
  }));

  // The turn strip lights the step on: the rows and the boss's turns of one round, those before it dimmed.
  const here = stepId(state.step);
  // The boss's moves are named on its line when it makes them, so the strip here is only the order: row, boss, row, boss.
  const steps = boardTurnSteps(card, rows).map((s) => {
    const named = single ? { ...s, label: s.boss === undefined ? 'Team' : 'Foe' } : s;
    return s.boss === undefined ? named : { ...named, boss: { moves: [] } };
  });
  const hereAt = steps.findIndex((s) => s.id === here);
  const strip = steps.map((s, k) => ({
    ...s,
    current: hereAt >= 0 && k === hereAt,
    done: hereAt >= 0 && k < hereAt,
  }));

  // Follow the creature that acts: the board scrolls sideways to its lane, unless the player scrolled it by hand a moment ago.
  useLayoutEffect(() => {
    if (landed?.kind !== 'creature' || landed.actor === null) return;
    if (Date.now() - handScrolledAt.current < 4000) return;
    const f = fighters.find((c) => c.key === landed.actor);
    if (f !== undefined)
      scrollToLanes(stripRef.current, f.col, f.col, { smooth: !reduced, follow: true });
  }, [landed]);

  // A hand-scroll holds the board where the player put it for a few seconds.
  useEffect(() => {
    const strip = stripRef.current;
    if (strip === null) return undefined;
    const held = (): void => {
      handScrolledAt.current = Date.now();
    };
    strip.addEventListener('pointerdown', held);
    strip.addEventListener('wheel', held, { passive: true });
    return () => {
      strip.removeEventListener('pointerdown', held);
      strip.removeEventListener('wheel', held);
    };
  }, []);

  const tap = (slot: number, button: HTMLElement): void => {
    const f = bySlot.get(slot);
    if (f === undefined || popovers === null) return;
    const now = state.creatures[f.key];
    const owner = names.players[f.owner] ?? 'Someone';
    popovers.openCustom(`stage-unit:${f.key}`, button, {
      label: f.name,
      body: (
        <div class="pop-stack">
          <strong class="pix">{f.name}</strong>
          <p>{`${owner} · ${elementName(f.element)} · ${f.role}`}</p>
          <p>{`${String(now?.hp ?? 0)} / ${String(f.maxHp)} HP${now?.out === true ? ' · out' : ''}`}</p>
          {f.knackName !== null && (
            <p>{`${f.knackName}${(now?.silenced ?? 0) > 0 ? ` (silenced, ${String(now?.silenced)} turns left)` : ''}`}</p>
          )}
        </div>
      ),
    });
  };

  // The marks, oldest first; the ones the boss will shed blink, the one just cashed flashes.
  const marks: MarkChipModel[] = state.marks.map((m) => ({
    element: m.element,
    stacks: m.stacks,
    sealed: m.sealed,
    expiring: state.expiring.includes(m.element),
    cashed: show?.cashed.includes(m.element) === true,
  }));

  // What the boss just did: its move's name over the plain label, or the plain attack.
  const move = landed?.kind === 'boss' ? card.moves.find((m) => m.name === show?.move) : undefined;
  const moveLine =
    landed?.kind !== 'boss'
      ? null
      : move === undefined
        ? `Attack · ${card.plain.label}`
        : `${move.name} · ${move.label}`;

  const art = bossArt(boss.id);
  const escalation =
    card.escalation === null
      ? null
      : { ...card.escalation, step: state.escalation?.step ?? card.escalation.step };
  const resisted = state.resistance;
  const strike: BossStrike | null =
    landed?.kind === 'boss' && show !== null && show.bossHit
      ? {
          action: 'attack',
          gimmick: null,
          targets: [...show.flash].filter((k): k is string => k !== null).slice(0, 6),
          zone: null,
          blocked: [],
          guarded: null,
        }
      : null;

  return (
    <section class="stage stage-v2" aria-label="Fight stage" ref={cssVars({ '--beat': '600ms' })}>
      <StageHead
        place={place}
        round={
          state.round > 0
            ? roundLabel(state.round, rounds)
            : lobby === true
              ? 'Get ready'
              : roundLabel(1, rounds)
        }
      />
      <div class="stage-boss">
        <div class="stage-boss-row">
          <div
            ref={bossRef}
            class={`stage-boss-art${hit.has(null) ? ' hit' : ''}${landed?.kind === 'boss' ? ' windup' : ''}`}
          >
            <Sprite sprite={art.sprite} scale={art.scale} alt={boss.name} />
            <FloatsV2 fx={fx} target={null} />
          </div>
        </div>
        <div class="stage-foe-line">
          <p class="stage-foe-name pix">{boss.name}</p>
          <ElementChip element={boss.element} context="boss" />
          <ArmourChip armour={card.armour} />
        </div>
        <p class="stage-move" aria-live="polite">
          {moveLine ?? ' '}
        </p>
        <SegmentBar
          size="boss"
          current={state.bossHp}
          max={hpMax}
          previous={before.bossHp}
          ticks={ticks ?? stageTicks()}
          label={`${boss.name} HP: ${String(state.bossHp)} / ${String(hpMax)}`}
          text={compactPair(state.bossHp, hpMax)}
        />
        <MarkStrip marks={marks} />
        {(state.mired > 0 || resisted !== null || escalation !== null || actions.length > 0) && (
          <div class="stage-status">
            {escalation !== null && <EscalatingMeter {...escalation} />}
            {state.mired > 0 && (
              <Tag
                kind="chip"
                icon={{ kind: 'glyph', id: 'mired' }}
                label={`Mired, ${String(state.mired)}`}
              >
                {`x${String(state.mired)}`}
              </Tag>
            )}
            {resisted !== null && <ResistChip resisted={resisted} />}
            {actions.map((a, k) => (
              <Tag
                key={`${a.kind}-${String(k)}`}
                kind="chip"
                icon={{
                  kind: 'glyph',
                  id: a.kind === 'shieldWall' ? 'shield' : a.kind === 'purge' ? 'purge' : 'ability',
                }}
              >
                {`${names.players[a.by] ?? 'Someone'}: ${ACTION_NAMES[a.kind]}`}
              </Tag>
            ))}
          </div>
        )}
      </div>

      <TurnStrip chips={strip} label="One round: the rows and the boss" />

      <RaidBoard
        stripRef={stripRef}
        rows={boardRows}
        v2
        {...(single ? { single: { label: 'Your team, left to right' }, size: 'large' as const } : {})}
        emptyLabel=""
        disabled={false}
        drag={NO_DRAG}
        statuses={null}
        cues={cues}
        onTap={tap}
      />
      {children}
      {/* The effects' layer sits inside the stage's padding, so nothing of it is drawn past the stage's content. */}
      <div class="stage-overlay">
        <div class="stage-strikes" ref={layerRef} aria-hidden="true">
          {strike !== null && (
            <BossFx
              key={`strike-${String(beat)}`}
              phase="impact"
              strike={strike}
              seed={beat}
              ms={0}
              element={boss.element}
              layer={layerRef}
              boss={() => bossRef.current}
              unit={(id) => {
                const slot = bySlotKey.get(id);
                return slot === undefined
                  ? null
                  : (stripRef.current?.querySelector<HTMLElement>(
                      `[data-slot="${String(slot)}"]`,
                    ) ?? null);
              }}
              zone={() => null}
            />
          )}
        </div>
        {intro !== null && <RoundIntro intro={intro} />}
      </div>
      {overlay}
    </section>
  );
}

/** The live inputs' names. */
export const ACTION_NAMES = { rally: 'Rally', shieldWall: 'Shield Wall', purge: 'Purge' } as const;

/** What the boss resists: the icon of the element (or of the reaction's mark) with a shield, and the words for a screen reader. */
function ResistChip({ resisted }: { resisted: NonNullable<BoardState['resistance']> }) {
  const element = resisted.element ?? resisted.reaction;
  if (element === null) return null;
  const icon = elementIcon(element);
  const label =
    resisted.element !== null
      ? `Resists ${elementName(element)} hits`
      : `Resists ${elementName(element)} reactions`;
  return (
    <span class="boss-resist" role="img" aria-label={label}>
      <Sprite sprite={combatGlyph('armour') ?? glyphOrUnknown('shield')} scale={2} />
      {icon !== undefined && <Sprite sprite={icon} scale={2} />}
    </span>
  );
}
