/**
 * The raid canvas's scene, the arena (docs/design/combat/raid-screen.md, sections 1 and 6): the boss on top with its HP bar, the board of
 * seats below, the same scene in every state. A caption on it is the now line (a `Nameplate`, a polite live region); up to three plates on
 * its frame open the left drawer; while you can place, the boss's moves sit beside it as small glyphs. While a stage plays, `stage` (the
 * `StageV2` in canvas mode) takes the place of the boss and the board, so the scene keeps its size and place.
 *
 * Built from the game's own pieces: `Sprite` and `bossArt`, `SegmentBar`, `RaidBoard`/`SlotButton`, `PanHint`, `Nameplate`.
 */
import type { ComponentChildren, RefObject } from 'preact';
import { bossArt } from '../art';
import { combatGlyph, moveGlyphId } from '../combat-glyphs';
import { glyphOrUnknown } from '../glyphs';
import { bossHpWords } from '../raid-progress';
import type { BossMoveV2 } from '../raid-v2-api';
import { Sprite } from '../sprites/Sprite';
import { Nameplate } from '../ui/Nameplate';
import { PanHint } from '../ui/PanHint';
import { RaidBoard, type BoardRowModel } from '../ui/RaidBoard';
import { SegmentBar } from '../ui/SegmentBar';
import type { SlotStripProps } from '../ui/SlotButton';
import { stageTicks } from '../BossCardV2';
import type { NowLine } from './now-line';

/** One plate on the scene's frame: it opens a left drawer. */
export interface ScenePlate {
  id: string;
  label: string;
  open: boolean;
  onOpen: (button: HTMLElement) => void;
}

/** The board as the scene draws it: the rows of seats and the shared strip state (drag, cues, taps). */
export interface SceneBoard extends Omit<SlotStripProps, 'emptyLabel'> {
  rows: readonly BoardRowModel[];
  stripRef: RefObject<HTMLDivElement | null>;
  emptyLabel: string;
}

export interface RaidSceneProps {
  /** `placing`, `playing`, `finale`, `idle` or `over`: the state the scene is in (a hook for its look and for tests). */
  state: string;
  now: NowLine;
  onNow: (button: HTMLElement) => void;
  plates: readonly ScenePlate[];
  boss: { id: string; name: string };
  hp: { current: number; max: number } | null;
  /** The boss has fallen: its picture stays, greyed, until the week ends. */
  fallen: boolean;
  onBoss: (button: HTMLElement) => void;
  /** The boss's picture scale (smaller on a phone, so the board has the room); default: the boss's own. */
  bossScale?: number;
  /** The boss's moves as glyphs beside it (while placing); null: none. */
  moves: readonly BossMoveV2[] | null;
  litMove: string | null;
  onMove: (move: BossMoveV2, button: HTMLElement) => void;
  /** The board (null: no party to show, as in a Festival week with nobody in). */
  board: SceneBoard | null;
  /** A stage playing takes the place of the boss and the board. */
  stage?: ComponentChildren;
  /** The reveal card over the scene (after the finale). */
  reveal?: ComponentChildren;
  /** Hints under the board (a refused drop). */
  hint?: string | null;
}

export function RaidScene(p: RaidSceneProps) {
  const art = bossArt(p.boss.id);
  const hp = p.hp === null ? null : bossHpWords(p.hp.current, p.hp.max);
  return (
    <div class="rc-scene" data-state={p.state}>
      <div class="rc-top">
        <ul class="rc-plates" aria-label="Raid overviews">
          {p.plates.map((plate) => (
            <li key={plate.id}>
              <button
                type="button"
                class="rc-plate"
                aria-expanded={plate.open}
                onClick={(event) => {
                  plate.onOpen(event.currentTarget);
                }}
              >
                <Nameplate size="sm" tone={plate.open ? 'gold' : 'bone'}>
                  {plate.label}
                </Nameplate>
              </button>
            </li>
          ))}
        </ul>
        {/* The now line: a caption on the scene, and a polite live region. A tap opens what it names. */}
        <div class="rc-now" role="status" aria-live="polite" data-now={p.now.id}>
          {p.now.tap === null ? (
            <Nameplate size="md">{p.now.text}</Nameplate>
          ) : (
            <button
              type="button"
              class="rc-now-button"
              onClick={(event) => {
                p.onNow(event.currentTarget);
              }}
            >
              <Nameplate size="md" tone="gold">
                {p.now.text}
              </Nameplate>
            </button>
          )}
        </div>
      </div>
      {p.stage !== undefined && p.stage !== null ? (
        <div class="rc-stage">{p.stage}</div>
      ) : (
        <>
          <div class="rc-boss">
            <div class="rc-boss-row">
              <button
                type="button"
                class={`rc-boss-art${p.fallen ? ' fallen' : ''}`}
                aria-label={`${p.boss.name}${p.fallen ? ', fallen' : ''}. Opens the boss.`}
                onClick={(event) => {
                  p.onBoss(event.currentTarget);
                }}
              >
                <Sprite
                  sprite={art.sprite}
                  scale={p.bossScale === undefined ? art.scale : Math.min(art.scale, p.bossScale)}
                  bob={!p.fallen}
                />
              </button>
            </div>
            {p.moves !== null && p.moves.length > 0 && (
              <ul class="rc-moves" aria-label="Boss moves">
                {p.moves.map((move) => (
                  <li key={move.id}>
                    <button
                      type="button"
                      class={`rc-move${p.litMove === move.id ? ' lit' : ''}`}
                      aria-pressed={p.litMove === move.id}
                      aria-label={`${move.name}, ${move.label}`}
                      onClick={(event) => {
                        p.onMove(move, event.currentTarget);
                      }}
                    >
                      <Sprite
                        sprite={combatGlyph(moveGlyphId(move)) ?? glyphOrUnknown('unknown')}
                        scale={2}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hp !== null && p.hp !== null && (
              <div class="rc-hp">
                <SegmentBar
                  size="boss"
                  current={p.hp.current}
                  max={p.hp.max}
                  ticks={stageTicks()}
                  label={hp.label}
                  text={hp.text}
                />
              </div>
            )}
          </div>
          {p.board !== null && (
            <div class="rc-board">
              <RaidBoard
                v2
                rows={p.board.rows}
                stripRef={p.board.stripRef}
                emptyLabel={p.board.emptyLabel}
                disabled={p.board.disabled}
                drag={p.board.drag}
                statuses={p.board.statuses}
                {...(p.board.cues === undefined ? {} : { cues: p.board.cues })}
                onTap={p.board.onTap}
              />
              <PanHint target={p.board.stripRef} id="raid-canvas-board" />
            </div>
          )}
          {p.hint !== undefined && p.hint !== null && (
            <p class="rc-hint muted small" role="status">
              {p.hint}
            </p>
          )}
        </>
      )}
      {p.reveal !== undefined && p.reveal !== null && <div class="rc-reveal">{p.reveal}</div>}
    </div>
  );
}
