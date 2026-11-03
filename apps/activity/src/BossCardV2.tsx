import { RULES } from '@creatures/game';
import { BossHead } from './BossCard';
import { combatGlyph, moveGlyphId } from './combat-glyphs';
import { elementSlug } from './art';
import { glyphOrUnknown } from './glyphs';
import { usePopoverHost } from './PopoverHost';
import { AIMED_WHEN_IT_COMES, litMove } from './raid-board-v2';
import { bossHpWords, rankLabel } from './raid-progress';
import type { RaidView } from './raid-api';
import type { BossCardV2 as CardView, BossMoveV2 } from './raid-v2-api';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { MoveTile } from './ui/MoveTile';
import { PipRow } from './ui/PipRow';
import { SegmentBar } from './ui/SegmentBar';
import { Tag } from './ui/Tag';
import { TurnStrip, type TurnStripChip } from './ui/TurnStrip';

/** How many pips a card's strength shows: one to five (the gear-pip look), a fifth of the full card each. */
export const CARD_PIPS = 5;

/** The pips a rule card's strength (basis points of the full card) lights: at least one while it has any strength. */
export function strengthPips(strengthBp: number): number {
  if (strengthBp <= 0) return 0;
  return Math.max(1, Math.min(CARD_PIPS, Math.round((strengthBp * CARD_PIPS) / 10_000)));
}

/** The stages of a weekend: stages 1 and 2, then the live finale. */
const STAGES = 3;

/**
 * Where each stage's goal sits on the boss's HP bar, as the share of the bar from the left (the HP that is left when the
 * stage is met): the bar's ticks. The finale is the bar's end.
 */
export function stageTicks(): number[] {
  return RULES.raid.phases
    .slice(0, STAGES - 1)
    .map((phase) => (10_000 - phase.clearAtLossBp) / 10_000);
}

/** The boss's armour as a shield with its number (the boss card's head and the fight stage's boss line). */
export function ArmourChip({ armour }: { armour: number }) {
  return (
    <span class="boss-armour" role="img" aria-label={`Armour ${String(armour)}`}>
      <Sprite sprite={combatGlyph('armour') ?? glyphOrUnknown('shield')} scale={2} />
      <span class="boss-armour-num">{armour}</span>
    </span>
  );
}

/** The Escalating meter: the boss's escalation by name with a pip for each step it has (the card's and the stage's). */
export function EscalatingMeter({ name, cap, step }: { name: string; cap: number; step: number }) {
  return (
    <span
      class="escalating"
      role="img"
      aria-label={`Escalating: ${name}, step ${String(step)} / ${String(cap)}`}
    >
      <Sprite sprite={combatGlyph('escalating') ?? glyphOrUnknown('unknown')} scale={2} />
      <span class="escalating-name">{name}</span>
      <PipRow count={cap} lit={step} />
    </span>
  );
}

/**
 * The steps of one round for the turn strip: row 1, boss, row 2, boss, row 3, boss (the boss takes a turn after every row of its
 * arena). A boss step carries the pictures of the moves that land on it, each with how often it is due. Nothing here is playing yet,
 * so no step is current or done.
 */
export function boardTurnSteps(card: CardView, rows: number): TurnStripChip[] {
  const idle = { current: false, done: false, ko: false } as const;
  const steps: TurnStripChip[] = [];
  for (let row = 0; row < rows; row++) {
    steps.push({ id: `row-${String(row)}`, label: `Row ${String(row + 1)}`, ...idle });
    steps.push({
      id: `boss-${String(row)}`,
      label: 'Boss',
      ...idle,
      boss: {
        moves: card.moves
          .filter((m) => !m.later && m.turn === row)
          .map((m) => ({
            glyph: moveGlyphId(m),
            every: m.every,
            label: `${m.name}, ${m.label}`,
          })),
      },
    });
  }
  return steps;
}

/**
 * The boss card of a combat v2 week (docs/design/combat/proposals/001-combat-v2.md, "On the board: The boss card"): the head (picture,
 * name, element, armour as a shield with its number, the weekend's HP bar with a tick per stage and last week's best as a ghost),
 * the rule cards with their strength as pips and the Escalating meter (a row that is empty is not drawn, so the tutorial boss shows
 * neither), the plain attack, the moves as tiles (a tap lights the slots a move would hit on the board; one aimed when it comes says
 * so) and the turn strip. Every name and sentence is the server's, drawn as text only. No text calls any boss harder than another.
 */
export function BossCardV2({
  view,
  lit,
  onLit,
}: {
  view: RaidView;
  /** The id of the move tapped (its slots light on the board), or null. */
  lit: string | null;
  onLit: (moveId: string | null) => void;
}) {
  const v2 = view.v2;
  const popovers = usePopoverHost();
  if (v2 === undefined) return null;
  const { boss } = view;
  const { card } = v2;
  const hp = view.party?.bossHp ?? null;
  const rank = rankLabel(view.rank);
  const arena = { rows: v2.rows, cols: v2.cols };
  const stage = Math.min(v2.nextStage, STAGES);
  const element = elementSlug(boss.element);
  const moves = card.moves;
  const tapped = moves.find((m) => m.id === lit);
  const aimedLater = tapped !== undefined && litMove(v2.preview, tapped).slots === null;
  return (
    <section
      class={`raid-section boss-card boss-card-v2 el-${element}`}
      aria-labelledby="raid-boss-name"
    >
      <BossHead
        boss={boss}
        status={
          <>
            {rank !== null && (
              <Tag tone="rank" entry="boss-rank">
                {rank}
              </Tag>
            )}
            <ElementChip element={boss.element} context="boss" />
            <ArmourChip armour={card.armour} />
            {v2.bestShareBp > 0 && <Tag kind="badge">Back again</Tag>}
          </>
        }
      >
        {hp !== null && (
          <div class="boss-hp">
            <SegmentBar
              size="boss"
              current={hp.current}
              max={hp.max}
              ticks={stageTicks()}
              {...(v2.bestShareBp > 0 ? { ghost: 1 - v2.bestShareBp / 10_000 } : {})}
              {...bossHpWords(hp.current, hp.max)}
            />
            <p class="boss-stage muted small">
              {v2.nextStage > STAGES
                ? 'Weekend over'
                : `Stage ${String(stage)} / ${String(STAGES)}`}
            </p>
          </div>
        )}
      </BossHead>
      {(card.cards.length > 0 || card.escalation !== null) && (
        <div class="boss-rules">
          {card.cards.map((rule) => (
            <button
              key={rule.id}
              type="button"
              class="rule-card"
              aria-label={`${rule.name}, strength ${String(strengthPips(card.strengthBp))} / ${String(CARD_PIPS)}`}
              onClick={(event) => {
                popovers?.openCustom(`rule-card:${rule.id}`, event.currentTarget, {
                  label: rule.name,
                  body: (
                    <div class="pop-stack">
                      <strong class="pix">{rule.name}</strong>
                      <p>{rule.asks}</p>
                    </div>
                  ),
                });
              }}
            >
              <span class="rule-card-name">{rule.name}</span>
              <PipRow count={CARD_PIPS} lit={strengthPips(card.strengthBp)} />
            </button>
          ))}
          {card.escalation !== null && <EscalatingMeter {...card.escalation} />}
        </div>
      )}
      <p class="boss-plain">
        <Sprite sprite={combatGlyph('attack') ?? glyphOrUnknown('unknown')} scale={2} />
        <span>
          {`Attack: ${card.plain.label}`}
          {card.plain.hits > 1 ? ` x${String(card.plain.hits)}` : ''}
        </span>
      </p>
      {moves.length > 0 && (
        <ul class="boss-moves" aria-label="Boss moves">
          {moves.map((move: BossMoveV2) => (
            <li key={move.id}>
              <MoveTile
                move={move}
                arena={arena}
                lit={litMove(v2.preview, move).slots}
                selected={lit === move.id}
                onToggle={() => {
                  onLit(lit === move.id ? null : move.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {aimedLater && (
        <p class="muted small boss-aimed" role="status">
          {AIMED_WHEN_IT_COMES}
        </p>
      )}
      <TurnStrip chips={boardTurnSteps(card, v2.rows)} label="One round: the rows and the boss" />
    </section>
  );
}
